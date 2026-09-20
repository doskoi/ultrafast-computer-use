"""Small JSONL bridge from the Node package to the local laya-mlx library."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _load_agent():
    source_path = os.environ.get("LAYA_MLX_PATH")
    if source_path:
        sys.path.insert(0, str(Path(source_path).expanduser()))
    try:
        import laya_mlx
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "install the local laya-mlx checkout or set LAYA_MLX_PATH to it"
        ) from exc
    model = os.environ.get("LAYA_MLX_MODEL", "aac6fef/laya-multilingual-mlx")
    dtype = os.environ.get("LAYA_MLX_DTYPE", "float16")
    device = os.environ.get("LAYA_MLX_DEVICE", "gpu")
    return laya_mlx.load(model, dtype=dtype, device=device)


def main() -> None:
    agent = None
    for raw in sys.stdin:
        request: object = {}
        try:
            request = json.loads(raw)
            if not isinstance(request, dict) or type(request.get("id")) is not int:
                raise ValueError("request must contain an integer id")
            if agent is None:
                agent = _load_agent()
            result = agent.predict(request["state"], request["questions"])
            response = {"id": request["id"], "ok": True, "result": result}
        except Exception as exc:  # noqa: BLE001 - keep the JSON protocol alive for one request
            request_id = request.get("id") if isinstance(request, dict) else None
            response = {
                "id": request_id,
                "ok": False,
                "error": {"message": f"{type(exc).__name__}: {exc}"},
            }
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
