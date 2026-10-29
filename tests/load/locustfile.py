"""
Locust Performance & Stress Load Testing Suite for ClinixVault.
Simulates concurrent clinical workloads across:
- Radiology report generation
- Clinical text summarization
- System health status polling
"""

import random
from locust import HttpUser, task, between
from tests.load.scenarios import RADIOLOGY_SCENARIOS, SUMMARIZATION_SCENARIOS


class ClinixVaultUser(HttpUser):
    wait_time = between(0.5, 2.5)

    def on_start(self):
        # Authenticate with test credentials
        response = self.client.post(
            "/api/v1/auth/login",
            json={"username": "perf_doctor", "password": "vaultpassword"},
        )
        if response.status_code == 200:
            token = response.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {token}"}
        else:
            self.headers = {}

    @task(3)
    def check_health(self):
        self.client.get("/api/v1/health")

    @task(2)
    def generate_radiology_report(self):
        payload = random.choice(RADIOLOGY_SCENARIOS)
        self.client.post(
            "/api/v1/radiology/generate",
            json=payload,
            headers=self.headers,
            name="/api/v1/radiology/generate",
        )

    @task(2)
    def summarize_clinical_record(self):
        payload = random.choice(SUMMARIZATION_SCENARIOS)
        self.client.post(
            "/api/v1/summarize",
            json=payload,
            headers=self.headers,
            name="/api/v1/summarize",
        )
