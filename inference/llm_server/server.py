"""
ClinixVault LLM Microservice (Port 8002).
Provides high-performance clinical text summarization, SOAP note generation,
and FHIR R4 structured schema decoding.
"""

import os
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.config import settings
from inference.shared.logger import get_logger
from inference.shared.health import create_health_router
from inference.shared.metrics import setup_microservice_metrics, record_inference_metrics
from inference.llm_server.schemas import (
    SOAPGenerationRequest,
    SOAPGenerationResponse,
    SOAPNoteSection,
    SummarizeRequest,
    SummarizeResponse,
    FHIRStructuredRequest,
    FHIRStructuredResponse,
)
from inference.llm_server.model_loader import get_llm_runner
from inference.llm_server.structured_output import StructuredOutputEngine

logger = get_logger("clinixvault.llm_server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting ClinixVault LLM Server...")
    _ = get_llm_runner()
    yield
    logger.info("Stopping ClinixVault LLM Server...")


app = FastAPI(
    title="ClinixVault LLM Scribe & Summarization Service",
    version="1.0.0",
    description="Air-gapped edge microservice for clinical notes, SOAP synthesis, and FHIR schema generation",
    lifespan=lifespan,
)

app.include_router(create_health_router("llm-service"))
setup_microservice_metrics(app, "llm-server")
fhir_engine = StructuredOutputEngine()


@app.post("/generate_soap", response_model=SOAPGenerationResponse)
async def generate_soap_note(request: SOAPGenerationRequest):
    start_time = time.time()
    runner = get_llm_runner()

    result = runner.generate_soap_note(request.clinical_dialogue)
    duration_ms = round((time.time() - start_time) * 1000, 2)

    soap_section = SOAPNoteSection(
        subjective=result.get("subjective", ""),
        objective=result.get("objective", ""),
        assessment=result.get("assessment", ""),
        plan=result.get("plan", ""),
    )

    formatted_md = (
        f"### S - Subjective\n{soap_section.subjective}\n\n"
        f"### O - Objective\n{soap_section.objective}\n\n"
        f"### A - Assessment\n{soap_section.assessment}\n\n"
        f"### P - Plan\n{soap_section.plan}\n"
    )

    record_inference_metrics(
        service="llm-server",
        model="ClinixVault-Mistral-7B-SOAP",
        task="soap_synthesis",
        duration_seconds=duration_ms / 1000.0,
        token_count=len(formatted_md.split()),
        status="success",
    )

    return SOAPGenerationResponse(
        soap_note=soap_section,
        formatted_markdown=formatted_md,
        identified_allergies=result.get("allergies", []),
        prescribed_medications=result.get("medications", []),
        follow_up_instructions=result.get("follow_up", "Routine follow up as advised."),
        generation_latency_ms=duration_ms,
    )


@app.post("/summarize", response_model=SummarizeResponse)
async def summarize_clinical_record(request: SummarizeRequest):
    start_time = time.time()
    runner = get_llm_runner()

    target_model = request.model_name or "ClinixVault-Mistral-7B-Summarizer"
    res = runner.summarize_clinical_text(request.text, summary_type=request.summary_type, model_name=request.model_name)
    duration_ms = round((time.time() - start_time) * 1000, 2)
    resolved_model = res.get("model_version", target_model)

    record_inference_metrics(
        service="llm-server",
        model=resolved_model,
        task=f"summarize_{request.summary_type}",
        duration_seconds=duration_ms / 1000.0,
        token_count=len(res["summary"].split()),
        status="success",
    )

    print(
        f"\n================================================================================\n"
        f"🏥 [LLM MICROSERVICE - SUMMARIZE ENDPOINT VERBOSE LOG]\n"
        f"⏱️  Duration:           {duration_ms:.2f} ms\n"
        f"🤖 Model:              {resolved_model}\n"
        f"📑 Summary Type:       {request.summary_type}\n"
        f"📏 Text Length:        {len(request.text)} chars\n"
        f"📝 Generated Summary:  {res['summary'][:150]}...\n"
        f"🔍 Findings Count:     {len(res['key_findings'])}\n"
        f"📋 Action Items Count: {len(res['action_items'])}\n"
        f"================================================================================\n",
        flush=True,
    )

    return SummarizeResponse(
        summary=res["summary"],
        key_findings=res["key_findings"],
        action_items=res["action_items"],
        latency_ms=duration_ms,
        model_version=resolved_model,
    )


@app.post("/structured_fhir", response_model=FHIRStructuredResponse)
async def generate_structured_fhir(request: FHIRStructuredRequest):
    start_time = time.time()
    fhir_data = fhir_engine.extract_or_build_fhir(
        text=request.clinical_narrative,
        resource_type=request.target_resource_type,
    )
    duration_ms = round((time.time() - start_time) * 1000, 2)

    return FHIRStructuredResponse(
        resource_type=request.target_resource_type,
        fhir_json=fhir_data,
        schema_valid=True,
        latency_ms=duration_ms,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.LLM_HOST, port=settings.LLM_PORT)
