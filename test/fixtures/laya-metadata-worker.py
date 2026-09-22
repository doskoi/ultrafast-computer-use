import json
import sys


for line in sys.stdin:
    request = json.loads(line)
    print(json.dumps({
        "id": request["id"],
        "ok": True,
        "result": {
            "model": "laya-test",
            "answers": {
                "operation": {
                    "choice": "DONE",
                    "probabilities": {"DONE": 1.0},
                    "confidence": 1.0,
                    "action": {"act_probability": 0.75},
                },
                "goal_complete": {"noul": 0.9},
            },
            "usage": {"input_tokens": 42, "output_tokens": 0},
        },
    }), flush=True)
