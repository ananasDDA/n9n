"""
Хранилище workflow: in-memory (при перезапуске теряется). Можно заменить на SQLite/PostgreSQL.
"""
import uuid
from datetime import datetime
from typing import Any

_store: dict[str, dict[str, Any]] = {}


def create(name: str, nodes: list[dict], edges: list[dict]) -> dict[str, Any]:
    wf_id = str(uuid.uuid4())[:8]
    _store[wf_id] = {
        "id": wf_id,
        "name": name or "Без названия",
        "nodes": nodes,
        "edges": edges,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    return _store[wf_id].copy()


def list_workflows() -> list[dict[str, Any]]:
    return [{"id": w["id"], "name": w["name"], "updated_at": w["updated_at"]} for w in _store.values()]


def get(wf_id: str) -> dict[str, Any] | None:
    w = _store.get(wf_id)
    return w.copy() if w else None

def update(wf_id: str, name: str | None, nodes: list[dict] | None, edges: list[dict] | None) -> dict[str, Any] | None:
    if wf_id not in _store:
        return None
    w = _store[wf_id]
    if name is not None:
        w["name"] = name
    if nodes is not None:
        w["nodes"] = nodes
    if edges is not None:
        w["edges"] = edges
    w["updated_at"] = datetime.utcnow().isoformat() + "Z"
    return w.copy()


def delete(wf_id: str) -> bool:
    if wf_id in _store:
        del _store[wf_id]
        return True
    return False
