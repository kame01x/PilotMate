import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from fastapi import APIRouter, Depends, HTTPException

from backend.api.deps import get_current_user
from backend.documents import get_document, get_library_reference, list_by_aircraft, list_general_reference
from backend.exam_prep import get_section, list_sections

router = APIRouter(tags=["reference"])


@router.get("/library")
def library(user=Depends(get_current_user)):
    return get_library_reference()


@router.get("/library/aircraft/{aircraft_type}")
def library_by_aircraft(aircraft_type: str, user=Depends(get_current_user)):
    return list_by_aircraft(aircraft_type)


@router.get("/library/general")
def library_general(user=Depends(get_current_user)):
    return list_general_reference()


@router.get("/library/document/{document_id}")
def library_document(document_id: int, user=Depends(get_current_user)):
    doc = get_document(document_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    return doc


@router.get("/exam-prep/sections")
def exam_sections(user=Depends(get_current_user)):
    return {"sections": list_sections()}


@router.get("/exam-prep/sections/{name}")
def exam_section(name: str, user=Depends(get_current_user)):
    result = get_section(name)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result
