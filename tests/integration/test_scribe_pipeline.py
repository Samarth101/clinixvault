"""
Integration Test: End-to-End Ambient Scribe WebSocket Pipeline.
Validates live conversation streaming and subsequent SOAP synthesis.
"""

import pytest


def test_scribe_pipeline_websocket_e2e(gateway_client, test_patient):
    with gateway_client.websocket_connect("/api/v1/scribe/stream") as websocket:
        # Initialize session
        websocket.send_json({"type": "init", "patient_id": test_patient.id})
        msg_ready = websocket.receive_json()
        assert msg_ready["type"] == "ready"

        # Stream dialogue turns
        websocket.send_json(
            {
                "type": "dialogue_turn",
                "speaker": "DOCTOR",
                "text": "Hello Mr. Smith, what brings you into the clinic today?",
            }
        )
        ack1 = websocket.receive_json()
        assert ack1["type"] == "ack"
        assert ack1["turn_count"] == 1

        websocket.send_json(
            {
                "type": "dialogue_turn",
                "speaker": "PATIENT",
                "text": "I have been experiencing a sharp chest discomfort when climbing stairs for four days.",
            }
        )
        ack2 = websocket.receive_json()
        assert ack2["type"] == "ack"
        assert ack2["turn_count"] == 2

        # Finalize and trigger SOAP note generation
        websocket.send_json({"type": "finalize"})
        result = websocket.receive_json()

        assert result["type"] == "soap_synthesized"
        assert "soap" in result
        soap_data = result["soap"]
        assert "soap_note" in soap_data
        assert "subjective" in soap_data["soap_note"]
        assert "objective" in soap_data["soap_note"]
        assert "assessment" in soap_data["soap_note"]
        assert "plan" in soap_data["soap_note"]
        assert "provenance" in result
        assert "citations" in result
