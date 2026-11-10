"""
Clinician Management REST API Gateway Routes.
Provides database-backed CRUD endpoints for hospital staff, attending clinicians,
and active clinical session authentication.
"""

import os
import sys
import uuid
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from backend.database.connection import get_db
from backend.database.models import Clinician
from backend.gateway.schemas.requests import ClinicianCreateRequest, ClinicianResponse
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.gateway.clinicians")
router = APIRouter(prefix="/api/v1/clinicians", tags=["Clinicians"])


def _extract_initials(name: str) -> str:
    cleaned = (name or "MD").replace("Dr.", "").replace("MD", "").replace("RN", "").replace("CMIO", "").strip()
    parts = cleaned.split()
    if len(parts) >= 2:
        return f"{parts[0][0]}{parts[1][0]}".upper()
    elif len(parts) == 1 and len(parts[0]) > 0:
        return parts[0][:2].upper()
    return "MD"


@router.get("", response_model=List[ClinicianResponse])
async def list_clinicians(db: Session = Depends(get_db)):
    """
    Returns all registered clinicians from the database.
    """
    clinicians = db.query(Clinician).order_by(Clinician.created_at.desc()).all()
    res = []
    for c in clinicians:
        res.append(
            ClinicianResponse(
                id=c.id,
                name=c.name,
                role=c.role or "Attending Physician",
                title=c.title or "Licensed Clinician",
                department=c.department or "Internal Medicine",
                specialty=c.specialty or "Clinical Medicine",
                npi=c.npi or f"NPI-1000000000",
                email=c.email,
                access_tier=c.access_tier or "Tier 1 — Executive/Attending",
                break_glass_authorized=bool(c.break_glass_authorized),
                sso_status=c.sso_status or "Active Directory Synced",
                status=c.status or "Active",
                assigned_node=c.assigned_node or "CV-NODE-01 (Exam 1-4)",
                badge_id=c.badge_id or f"BADGE-{c.id[:6]}",
                auth_method=c.auth_method or "Keycloak Active Directory SSO",
                avatar_initials=c.avatar_initials or _extract_initials(c.name),
                is_active=bool(c.is_active),
                created_at=c.created_at.isoformat() if c.created_at else None,
            )
        )
    return res


@router.post("", response_model=ClinicianResponse, status_code=status.HTTP_201_CREATED)
async def create_clinician(payload: ClinicianCreateRequest, db: Session = Depends(get_db)):
    """
    Registers a new clinician in the ACID database.
    """
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Clinician name cannot be empty.")

    clinician_id = payload.id or f"clinician-{uuid.uuid4().hex[:8]}"
    initials = payload.avatar_initials or _extract_initials(payload.name)
    npi = payload.npi or f"NPI-{uuid.uuid4().hex[:10].upper()}"
    badge = payload.badge_id or f"BADGE-{clinician_id[-4:].upper()}"

    # Deactivate existing active clinicians if this is the first clinician
    existing_count = db.query(Clinician).count()
    is_first = existing_count == 0

    record = Clinician(
        id=clinician_id,
        name=payload.name.strip(),
        role=payload.role or "Attending Physician",
        title=payload.title or "Licensed Clinician",
        department=payload.department or "Internal Medicine",
        specialty=payload.specialty or "Clinical Medicine",
        npi=npi,
        email=payload.email,
        access_tier=payload.access_tier or "Tier 1 — Executive/Attending",
        break_glass_authorized=bool(payload.break_glass_authorized),
        sso_status=payload.sso_status or "Active Directory Synced",
        status=payload.status or "Active",
        assigned_node=payload.assigned_node or "CV-NODE-01 (Exam 1-4)",
        badge_id=badge,
        auth_method=payload.auth_method or "Keycloak Active Directory SSO",
        avatar_initials=initials,
        is_active=is_first,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    logger.info(f"Registered clinician {record.name} ({record.id}) into database.")
    return ClinicianResponse(
        id=record.id,
        name=record.name,
        role=record.role,
        title=record.title,
        department=record.department,
        specialty=record.specialty,
        npi=record.npi,
        email=record.email,
        access_tier=record.access_tier,
        break_glass_authorized=bool(record.break_glass_authorized),
        sso_status=record.sso_status,
        status=record.status,
        assigned_node=record.assigned_node,
        badge_id=record.badge_id,
        auth_method=record.auth_method,
        avatar_initials=record.avatar_initials,
        is_active=bool(record.is_active),
        created_at=record.created_at.isoformat() if record.created_at else None,
    )


@router.get("/active", response_model=Optional[ClinicianResponse])
async def get_active_clinician(db: Session = Depends(get_db)):
    """
    Returns the currently active authenticated clinician session from the database.
    """
    active = db.query(Clinician).filter(Clinician.is_active == True).first()
    if not active:
        active = db.query(Clinician).order_by(Clinician.created_at.asc()).first()
    if not active:
        return None

    return ClinicianResponse(
        id=active.id,
        name=active.name,
        role=active.role,
        title=active.title,
        department=active.department,
        specialty=active.specialty,
        npi=active.npi,
        email=active.email,
        access_tier=active.access_tier,
        break_glass_authorized=bool(active.break_glass_authorized),
        sso_status=active.sso_status,
        status=active.status,
        assigned_node=active.assigned_node,
        badge_id=active.badge_id,
        auth_method=active.auth_method,
        avatar_initials=active.avatar_initials,
        is_active=True,
        created_at=active.created_at.isoformat() if active.created_at else None,
    )


@router.post("/{clinician_id}/activate", response_model=ClinicianResponse)
async def activate_clinician(clinician_id: str, db: Session = Depends(get_db)):
    """
    Activates the specified clinician as the primary authenticated session.
    """
    clinician = db.query(Clinician).filter(Clinician.id == clinician_id).first()
    if not clinician:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinician not found.")

    db.query(Clinician).update({Clinician.is_active: False})
    clinician.is_active = True
    db.commit()
    db.refresh(clinician)

    logger.info(f"Activated clinician session: {clinician.name} ({clinician.id})")
    return ClinicianResponse(
        id=clinician.id,
        name=clinician.name,
        role=clinician.role,
        title=clinician.title,
        department=clinician.department,
        specialty=clinician.specialty,
        npi=clinician.npi,
        email=clinician.email,
        access_tier=clinician.access_tier,
        break_glass_authorized=bool(clinician.break_glass_authorized),
        sso_status=clinician.sso_status,
        status=clinician.status,
        assigned_node=clinician.assigned_node,
        badge_id=clinician.badge_id,
        auth_method=clinician.auth_method,
        avatar_initials=clinician.avatar_initials,
        is_active=True,
        created_at=clinician.created_at.isoformat() if clinician.created_at else None,
    )


@router.delete("/{clinician_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_clinician(clinician_id: str, db: Session = Depends(get_db)):
    """
    Decommissions a clinician from the database.
    """
    clinician = db.query(Clinician).filter(Clinician.id == clinician_id).first()
    if not clinician:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinician not found.")

    db.delete(clinician)
    db.commit()
    logger.info(f"Decommissioned clinician: {clinician_id}")
    return None
