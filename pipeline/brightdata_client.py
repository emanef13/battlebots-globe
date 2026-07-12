"""Thin Bright Data REST client used by the collection jobs.

Auth: set BRIGHTDATA_API_TOKEN (and optionally BRIGHTDATA_UNLOCKER_ZONE).
Docs: https://docs.brightdata.com — every page also serves raw markdown
by appending `.md`.
"""

from __future__ import annotations

import os
import time
from typing import Any

import requests

API_BASE = "https://api.brightdata.com"


class BrightDataError(RuntimeError):
    pass


class BrightData:
    def __init__(self, token: str | None = None, unlocker_zone: str | None = None):
        self.token = token or os.environ.get("BRIGHTDATA_API_TOKEN")
        if not self.token:
            raise BrightDataError(
                "BRIGHTDATA_API_TOKEN is not set. Create an API key in the Bright Data "
                "control panel (Account settings) and export it."
            )
        self.unlocker_zone = unlocker_zone or os.environ.get(
            "BRIGHTDATA_UNLOCKER_ZONE", "web_unlocker1"
        )
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {self.token}"

    # ---------- Web Unlocker: fetch any URL through the unblocking proxy ----------

    def fetch(self, url: str, data_format: str | None = None, country: str | None = None) -> str:
        """Fetch a URL via Web Unlocker. data_format=None -> raw HTML, "markdown" -> LLM-ready markdown."""
        payload: dict[str, Any] = {"zone": self.unlocker_zone, "url": url, "format": "raw"}
        if data_format:
            payload["data_format"] = data_format
        if country:
            payload["country"] = country
        resp = self.session.post(f"{API_BASE}/request", json=payload, timeout=120)
        if resp.status_code != 200:
            raise BrightDataError(f"Unlocker fetch failed ({resp.status_code}): {resp.text[:300]}")
        return resp.text

    # ---------- Web Scraper API: trigger -> poll -> download ----------

    def trigger(self, dataset_id: str, inputs: list[dict], **params: str) -> str:
        """Trigger an async scraper job; returns a snapshot_id."""
        query = {"dataset_id": dataset_id, "format": "json", **params}
        resp = self.session.post(
            f"{API_BASE}/datasets/v3/trigger", params=query, json=inputs, timeout=60
        )
        if resp.status_code != 200:
            raise BrightDataError(f"Trigger failed ({resp.status_code}): {resp.text[:300]}")
        snapshot_id = resp.json().get("snapshot_id")
        if not snapshot_id:
            raise BrightDataError(f"Trigger returned no snapshot_id: {resp.text[:300]}")
        return snapshot_id

    def progress(self, snapshot_id: str) -> str:
        resp = self.session.get(
            f"{API_BASE}/datasets/v3/snapshots/{snapshot_id}/progress", timeout=30
        )
        resp.raise_for_status()
        return resp.json().get("status", "unknown")

    def download(self, snapshot_id: str) -> list[dict]:
        resp = self.session.get(
            f"{API_BASE}/datasets/v3/snapshots/{snapshot_id}/data",
            params={"format": "json"},
            timeout=300,
        )
        resp.raise_for_status()
        return resp.json()

    def wait_and_download(
        self, snapshot_id: str, timeout_s: int = 900, poll_s: int = 10
    ) -> list[dict]:
        """Poll a snapshot until ready (discovery jobs take minutes), then download."""
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            status = self.progress(snapshot_id)
            if status == "ready":
                return self.download(snapshot_id)
            if status == "failed":
                raise BrightDataError(f"Snapshot {snapshot_id} failed")
            time.sleep(poll_s)
        raise BrightDataError(f"Snapshot {snapshot_id} not ready after {timeout_s}s")
