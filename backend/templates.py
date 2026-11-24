"""イベントの持ち物テンプレート（Stage18）。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import Member, current_member
from db import get_supabase

router = APIRouter(prefix="/api/checklist-templates", tags=["templates"])


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    items: list[str] = Field(min_length=1, max_length=100)


@router.get("")
async def list_templates(supabase=Depends(get_supabase)):
    try:
        return supabase.table("checklist_templates").select("*").order("name").execute().data or []
    except Exception:
        return []


@router.post("", status_code=201)
async def save_template(payload: TemplateIn, supabase=Depends(get_supabase), me: Member = Depends(current_member)):
    """同じ名前があれば上書きする。"""
    items = [i.strip() for i in payload.items if i.strip()]
    name = payload.name.strip()
    existing = supabase.table("checklist_templates").select("id").eq("name", name).execute().data
    if existing:
        return (
            supabase.table("checklist_templates").update({"items": items}).eq("id", existing[0]["id"]).execute().data[0]
        )
    return (
        supabase.table("checklist_templates")
        .insert({"name": name, "items": items, "created_by": me.name})
        .execute()
        .data[0]
    )


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: str, supabase=Depends(get_supabase)):
    res = supabase.table("checklist_templates").delete().eq("id", template_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="見つかりません")
    return None
