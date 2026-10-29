"""
Clinical Knowledge Graph Schema, Ontological Definitions, and Seed Data.
Conforms to HL7 FHIR R4, SNOMED CT, ICD-10-CM, LOINC, and RadLex ontologies.
"""

from typing import Dict, Any, List


class GraphNodeLabels:
    PATIENT = "Patient"
    ENCOUNTER = "Encounter"
    CONDITION = "Condition"
    MEDICATION = "Medication"
    OBSERVATION = "Observation"
    ANATOMY = "Anatomy"
    DIAGNOSTIC_REPORT = "DiagnosticReport"
    PROVENANCE = "ProvenanceNode"
    LAB_RESULT = "LabResult"


class GraphRelationTypes:
    HAS_ENCOUNTER = "HAS_ENCOUNTER"
    DIAGNOSED_WITH = "DIAGNOSED_WITH"
    LOCATED_AT = "LOCATED_AT"
    MANAGED_BY = "MANAGED_BY"
    PRESCRIBED = "PRESCRIBED"
    MANIFESTS_SYMPTOM = "MANIFESTS_SYMPTOM"
    REPORTS_FINDING = "REPORTS_FINDING"
    HAS_PROVENANCE = "HAS_PROVENANCE"
    ALLERGIC_TO = "ALLERGIC_TO"
    CONTRAINDICATED_WITH = "CONTRAINDICATED_WITH"
    NEXT_ENCOUNTER = "NEXT_ENCOUNTER"
    CONFIRMS_EPISODE = "CONFIRMS_EPISODE"
    INDICATES_CONDITION = "INDICATES_CONDITION"
    INTERVAL_CHANGE_FROM = "INTERVAL_CHANGE_FROM"
    MONITORS_RESPONSE = "MONITORS_RESPONSE"


# Curated High-Frequency Clinical Knowledge Triples (Pre-seeded Ontology)
CURATED_CLINICAL_ONTOLOGY: List[Dict[str, Any]] = [
    # Cardiology & Heart Failure Subgraph
    {
        "source": {"id": "cond-chf", "label": "Condition", "name": "Congestive Heart Failure", "code": "ICD-10 I50.9", "snomed": "42343007"},
        "target": {"id": "anat-heart", "label": "Anatomy", "name": "Cardiac Silhouette", "system": "FMA 7088"},
        "rel": "LOCATED_AT",
        "props": {"clinical_certainty": "established"}
    },
    {
        "source": {"id": "cond-chf", "label": "Condition", "name": "Congestive Heart Failure", "code": "ICD-10 I50.9", "snomed": "42343007"},
        "target": {"id": "cond-cardiomegaly", "label": "Condition", "name": "Cardiomegaly", "code": "ICD-10 I51.7", "snomed": "8186001"},
        "rel": "MANIFESTS_SYMPTOM",
        "props": {"frequency": "high", "indicator": "CTR > 0.50"}
    },
    {
        "source": {"id": "cond-chf", "label": "Condition", "name": "Congestive Heart Failure", "code": "ICD-10 I50.9", "snomed": "42343007"},
        "target": {"id": "med-furosemide", "label": "Medication", "name": "Furosemide", "code": "RxNorm 4603", "class": "Loop Diuretic"},
        "rel": "MANAGED_BY",
        "props": {"standard_dose": "20-40mg daily", "action": "Fluid excretion"}
    },
    {
        "source": {"id": "cond-chf", "label": "Condition", "name": "Congestive Heart Failure", "code": "ICD-10 I50.9", "snomed": "42343007"},
        "target": {"id": "obs-dyspnea", "label": "Observation", "name": "Dyspnea & Orthopnea", "code": "LOINC 88020-3"},
        "rel": "MANIFESTS_SYMPTOM",
        "props": {"severity": "exertional and nocturnal"}
    },
    {
        "source": {"id": "cond-cardiomegaly", "label": "Condition", "name": "Cardiomegaly", "code": "ICD-10 I51.7", "snomed": "8186001"},
        "target": {"id": "anat-heart", "label": "Anatomy", "name": "Cardiac Silhouette", "system": "FMA 7088"},
        "rel": "LOCATED_AT",
        "props": {"radiological_sign": "Transverse cardiac diameter"}
    },
    {
        "source": {"id": "cond-pleural-effusion", "label": "Condition", "name": "Pleural Effusion", "code": "ICD-10 J90", "snomed": "60046008"},
        "target": {"id": "anat-pleura", "label": "Anatomy", "name": "Pleural Cavity & Costophrenic Sulci", "system": "FMA 7311"},
        "rel": "LOCATED_AT",
        "props": {"sign": "Costophrenic angle blunting"}
    },
    {
        "source": {"id": "cond-pleural-effusion", "label": "Condition", "name": "Pleural Effusion", "code": "ICD-10 J90", "snomed": "60046008"},
        "target": {"id": "cond-atelectasis", "label": "Condition", "name": "Compressive Atelectasis", "code": "ICD-10 J98.11", "snomed": "46621007"},
        "rel": "MANIFESTS_SYMPTOM",
        "props": {"mechanism": "Extrinsic passive lung compression"}
    },

    # Pulmonology & Pneumonia Subgraph
    {
        "source": {"id": "cond-pneumonia", "label": "Condition", "name": "Community-Acquired Pneumonia", "code": "ICD-10 J18.9", "snomed": "233604007"},
        "target": {"id": "anat-lungs", "label": "Anatomy", "name": "Pulmonary Parenchyma / Lobar Alveoli", "system": "FMA 7195"},
        "rel": "LOCATED_AT",
        "props": {"pattern": "Focal dense alveolar consolidation"}
    },
    {
        "source": {"id": "cond-pneumonia", "label": "Condition", "name": "Community-Acquired Pneumonia", "code": "ICD-10 J18.9", "snomed": "233604007"},
        "target": {"id": "med-amoxicillin-clav", "label": "Medication", "name": "Amoxicillin-Clavulanate", "code": "RxNorm 617314", "class": "Aminopenicillin + Beta-Lactamase Inhibitor"},
        "rel": "MANAGED_BY",
        "props": {"standard_dose": "875/125mg q12h", "duration": "5-7 days"}
    },
    {
        "source": {"id": "cond-pneumonia", "label": "Condition", "name": "Community-Acquired Pneumonia", "code": "ICD-10 J18.9", "snomed": "233604007"},
        "target": {"id": "obs-cough-fever", "label": "Observation", "name": "Productive Cough & Fever", "code": "LOINC 41594-3"},
        "rel": "MANIFESTS_SYMPTOM",
        "props": {"acute": True}
    },

    # Orthopedics & Osteoarthritis Subgraph
    {
        "source": {"id": "cond-knee-oa", "label": "Condition", "name": "Bilateral Primary Knee Osteoarthritis", "code": "ICD-10 M17.0", "snomed": "239873007"},
        "target": {"id": "anat-knee-joint", "label": "Anatomy", "name": "Medial Tibiofemoral Compartment", "system": "FMA 35176"},
        "rel": "LOCATED_AT",
        "props": {"hallmark": "Joint space narrowing & marginal osteophytes"}
    },
    {
        "source": {"id": "cond-knee-oa", "label": "Condition", "name": "Bilateral Primary Knee Osteoarthritis", "code": "ICD-10 M17.0", "snomed": "239873007"},
        "target": {"id": "med-triamcinolone-inj", "label": "Medication", "name": "Intra-Articular Triamcinolone Acetonide", "code": "RxNorm 10763", "class": "Corticosteroid Injection"},
        "rel": "MANAGED_BY",
        "props": {"indication": "Symptomatic localized flare-up"}
    },
    {
        "source": {"id": "cond-knee-oa", "label": "Condition", "name": "Bilateral Primary Knee Osteoarthritis", "code": "ICD-10 M17.0", "snomed": "239873007"},
        "target": {"id": "med-physical-therapy", "label": "Medication", "name": "Quadriceps Strengthening & Physical Therapy", "code": "CPT 97110", "class": "Therapeutic Exercise"},
        "rel": "MANAGED_BY",
        "props": {"frequency": "Twice weekly for 6 weeks"}
    },
]
