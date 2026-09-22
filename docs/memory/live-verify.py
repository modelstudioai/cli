#!/usr/bin/env python3
"""Live-verify memory API wire format against the aligned backend doc.

Loads credentials from the repo .env. Never prints secrets.
Writes a markdown + json report under docs/memory/.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / ".env"
OUT_DIR = Path(__file__).resolve().parent
REPORT_MD = OUT_DIR / "2026-09-20-memory-live-verify.md"
REPORT_JSON = OUT_DIR / "2026-09-20-memory-live-verify.json"

USER_ID = "doc-verify-20260920"
POLL_INTERVAL_S = 3
POLL_TIMEOUT_S = 120


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def nested_keys(value: Any, prefix: str = "") -> list[str]:
    if isinstance(value, dict):
        keys: list[str] = []
        for child_key, child_value in value.items():
            path = f"{prefix}.{child_key}" if prefix else str(child_key)
            keys.append(path)
            keys.extend(nested_keys(child_value, path))
        return keys
    if isinstance(value, list) and value:
        first_object = next((item for item in value if isinstance(item, dict)), None)
        if first_object is not None:
            item_prefix = f"{prefix}[]" if prefix else "[]"
            return nested_keys(first_object, item_prefix)
    return []


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: redact(child) for key, child in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str) and value.startswith("sk-"):
        return "<redacted>"
    return value


class Verifier:
    def __init__(self, api_key: str, workspace_id: str, library_id: str, skill_project_id: str):
        self.api_key = api_key
        self.workspace_id = workspace_id
        self.library_id = library_id
        self.skill_project_id = skill_project_id
        self.base = f"https://{workspace_id}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory"
        self.calls: list[dict[str, Any]] = []
        self.created_node_ids: list[str] = []
        self.created_schema_id: str | None = None

    def request(
        self,
        name: str,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
        expected_fields: list[str] | None = None,
    ) -> dict[str, Any]:
        url = self.base + path
        if query:
            filtered = {key: value for key, value in query.items() if value is not None}
            url += "?" + urllib.parse.urlencode(filtered)
        payload = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=payload,
            method=method,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        started = time.time()
        status = 0
        response_body: Any = None
        error_text = None
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                status = response.status
                raw = response.read().decode("utf-8")
                response_body = json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            status = error.code
            raw = error.read().decode("utf-8", errors="replace")
            error_text = raw
            try:
                response_body = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                response_body = {"_raw": raw}
        except Exception as error:  # noqa: BLE001 — record any transport failure
            error_text = f"{type(error).__name__}: {error}"
            response_body = {"_error": error_text}

        actual_keys = nested_keys(response_body) if isinstance(response_body, dict) else []
        missing = []
        extra = []
        if expected_fields and isinstance(response_body, dict) and status < 400:
            actual_set = set(actual_keys)
            missing = [field for field in expected_fields if field not in actual_set]
            documented_prefixes = set(expected_fields)
            extra = [
                key
                for key in actual_keys
                if key not in documented_prefixes
                and not any(key.startswith(field + ".") or key.startswith(field + "[]") for field in expected_fields)
            ]

        record = {
            "name": name,
            "method": method,
            "path": path,
            "url": url.split("?")[0].replace(self.workspace_id, "{workspace_id}"),
            "query": query,
            "request_body": redact(body) if body is not None else None,
            "status": status,
            "elapsed_ms": int((time.time() - started) * 1000),
            "ok": 200 <= status < 300,
            "error": error_text[:500] if error_text else None,
            "response": redact(response_body),
            "actual_keys": actual_keys,
            "missing_vs_doc": missing,
            "extra_vs_doc": extra,
        }
        self.calls.append(record)
        print(f"[{status}] {method:6} {path}  {name}  ({record['elapsed_ms']}ms)", flush=True)
        return record

    def poll_event(self, event_id: str) -> dict[str, Any]:
        deadline = time.time() + POLL_TIMEOUT_S
        last: dict[str, Any] = {}
        round_index = 0
        while time.time() < deadline:
            round_index += 1
            last = self.request(
                f"GetEvent poll#{round_index}",
                "GET",
                f"/events/{event_id}",
                expected_fields=[
                    "request_id",
                    "events",
                    "events[].created_at",
                    "events[].updated_at",
                    "events[].event_id",
                    "events[].event_type",
                    "events[].memory_library_id",
                    "events[].resource_id",
                    "events[].resource_type",
                    "events[].status",
                    "events[].user_id",
                ],
            )
            events = (last.get("response") or {}).get("events") or []
            statuses = [event.get("status") for event in events]
            print(f"    poll#{round_index} statuses={statuses}", flush=True)
            if events and all(
                status in {"SUCCEEDED", "SUCCESS", "FAILED", "UNRECORDED"} for status in statuses
            ):
                return last
            time.sleep(POLL_INTERVAL_S)
        last["timed_out"] = True
        return last


def collect_node_ids(event_response: dict[str, Any]) -> list[str]:
    node_ids: list[str] = []
    for event in (event_response.get("response") or {}).get("events") or []:
        for item in event.get("result") or []:
            node_id = item.get("memory_node_id")
            if node_id:
                node_ids.append(node_id)
    return node_ids


def main() -> int:
    env = load_env(ENV_PATH)
    api_key = env.get("DASHSCOPE_API_KEY", "")
    workspace_id = env.get("BAILIAN_WORKSPACE_ID", "")
    library_id = env.get("BAILIAN_E2E_MEMORY_LIBRARY_ID", "")
    skill_project_id = env.get("BAILIAN_E2E_MEMORY_SKILL_PROJECT_ID", "")
    if not api_key or not workspace_id or not library_id:
        print("missing DASHSCOPE_API_KEY / BAILIAN_WORKSPACE_ID / BAILIAN_E2E_MEMORY_LIBRARY_ID", file=sys.stderr)
        return 2

    verifier = Verifier(api_key, workspace_id, library_id, skill_project_id)
    print(f"base=https://{{workspace_id}}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory", flush=True)
    print(f"library={library_id} skill_project={skill_project_id} user={USER_ID}", flush=True)

    # ---- read-only probes ----
    verifier.request(
        "ListMemory",
        "GET",
        "/memory_nodes",
        query={"user_id": USER_ID, "memory_library_id": library_id, "page_num": 1, "page_size": 10},
        expected_fields=["request_id", "memory_nodes", "total", "page_num", "page_size"],
    )
    verifier.request(
        "ListProfileSchemas",
        "GET",
        "/profile_schemas",
        query={"memory_library_id": library_id, "page_num": 1, "page_size": 10},
        expected_fields=["request_id", "profile_schemas", "total"],
    )
    verifier.request(
        "ListMemoryProjects",
        "GET",
        "/memory_projects",
        query={"memory_library_id": library_id, "page_num": 1, "page_size": 10},
        expected_fields=["request_id", "memory_projects", "total", "page_num", "page_size"],
    )
    verifier.request(
        "ListMemoryProjects skill",
        "GET",
        "/memory_projects",
        query={
            "memory_library_id": library_id,
            "memory_type": "skill",
            "page_num": 1,
            "page_size": 10,
        },
    )
    if skill_project_id:
        verifier.request(
            "GetMemoryProject skill",
            "GET",
            f"/memory_projects/{skill_project_id}",
            query={"memory_library_id": library_id},
            expected_fields=[
                "request_id",
                "project_id",
                "memory_library_id",
                "name",
                "instruction_type",
                "memory_type",
                "plan_version",
                "support_multi_modal",
                "created_at",
                "updated_at",
            ],
        )

    # ---- profile schema write ----
    schema = verifier.request(
        "CreateProfileSchema",
        "POST",
        "/profile_schemas",
        body={
            "memory_library_id": library_id,
            "name": "doc-verify-schema",
            "description": "live verify schema, safe to delete",
            "plan_version": "lite",
            "attributes": [
                {"name": "爱好", "description": "兴趣爱好", "immutable": False},
                {"name": "城市", "description": "常住城市", "immutable": False},
            ],
        },
        expected_fields=["request_id", "profile_schema_id"],
    )
    schema_id = (schema.get("response") or {}).get("profile_schema_id")
    verifier.created_schema_id = schema_id
    if schema_id:
        verifier.request(
            "GetProfileSchema",
            "GET",
            f"/profile_schemas/{schema_id}",
            query={"memory_library_id": library_id},
            expected_fields=["request_id", "name", "description", "attributes", "attributes[].attribute_id", "attributes[].name"],
        )
        verifier.request(
            "UpdateProfileSchema",
            "PATCH",
            f"/profile_schemas/{schema_id}",
            body={
                "memory_library_id": library_id,
                "description": "live verify schema updated",
                "plan_version": "lite",
            },
            expected_fields=["request_id"],
        )

    # ---- observation add-async ----
    add_observation = verifier.request(
        "AddMemory observation",
        "POST",
        "/add-async",
        body={
            "user_id": USER_ID,
            "memory_library_id": library_id,
            "timestamp": 1747278460,
            "messages": [
                {"role": "user", "content": "你好"},
                {"role": "assistant", "content": "你好，有什么可以帮您"},
                {"role": "user", "content": "我住在杭州，周末喜欢打篮球，明天下午三点提醒我开会。"},
                {"role": "assistant", "content": "好的，已记下。"},
            ],
            "meta_data": {"source": "doc-verify", "city": "Hangzhou"},
            **({"profile_schema": schema_id} if schema_id else {}),
        },
        expected_fields=["request_id", "event_id", "events", "events[].status", "events[].resource_type"],
    )
    observation_event_id = (add_observation.get("response") or {}).get("event_id")
    observation_final: dict[str, Any] = {}
    if observation_event_id:
        observation_final = verifier.poll_event(observation_event_id)
        verifier.created_node_ids.extend(collect_node_ids(observation_final))

    # ---- custom_content add ----
    add_custom = verifier.request(
        "AddMemory custom_content",
        "POST",
        "/add-async",
        body={
            "user_id": USER_ID,
            "memory_library_id": library_id,
            "custom_content": "用户下周要去上海参加 WAIC",
            "meta_data": {"source": "doc-verify-custom"},
        },
        expected_fields=["request_id", "event_id", "events"],
    )
    custom_event_id = (add_custom.get("response") or {}).get("event_id")
    if custom_event_id:
        custom_final = verifier.poll_event(custom_event_id)
        verifier.created_node_ids.extend(collect_node_ids(custom_final))

    # ---- skill add (may fail if not allowlisted / empty project) ----
    if skill_project_id:
        add_skill = verifier.request(
            "AddMemory skill",
            "POST",
            "/add-async",
            body={
                "user_id": USER_ID,
                "memory_library_id": library_id,
                "project_ids": [skill_project_id],
                "custom_content": "整理会议纪要",
                "skill_name": "会议纪要整理",
                "skill_description": "自动提取会议重点并生成摘要",
                "skill_tags": ["办公", "总结"],
            },
            expected_fields=["request_id", "event_id", "events"],
        )
        skill_event_id = (add_skill.get("response") or {}).get("event_id")
        if skill_event_id:
            skill_final = verifier.poll_event(skill_event_id)
            verifier.created_node_ids.extend(collect_node_ids(skill_final))

    # ---- list / search / node ----
    listed = verifier.request(
        "ListMemory after add",
        "GET",
        "/memory_nodes",
        query={"user_id": USER_ID, "memory_library_id": library_id, "page_num": 1, "page_size": 20},
        expected_fields=[
            "request_id",
            "memory_nodes",
            "memory_nodes[].memory_node_id",
            "memory_nodes[].content",
            "memory_nodes[].timestamp",
            "memory_nodes[].created_at",
            "memory_nodes[].updated_at",
            "memory_nodes[].project_id",
            "memory_nodes[].meta_data",
            "memory_nodes[].memory_type",
            "memory_nodes[].status",
            "total",
            "page_num",
            "page_size",
        ],
    )
    listed_nodes = (listed.get("response") or {}).get("memory_nodes") or []
    for node in listed_nodes:
        node_id = node.get("memory_node_id")
        if node_id and node_id not in verifier.created_node_ids:
            verifier.created_node_ids.append(node_id)

    verifier.request(
        "SearchMemory observation",
        "POST",
        "/memory_nodes/search",
        body={
            "user_id": USER_ID,
            "memory_library_id": library_id,
            "messages": [{"role": "user", "content": "我下周有什么安排？"}],
            "top_k": 10,
            "min_score": 0,
            "memory_types": ["observation"],
            "plan_version": "lite",
            "query_timestamp": 1747278460,
        },
        expected_fields=[
            "request_id",
            "plan_version",
            "memory_nodes",
            "memory_nodes[].memory_node_id",
            "memory_nodes[].content",
            "memory_nodes[].memory_type",
            "memory_nodes[].score",
            "memory_nodes[].status",
        ],
    )
    search_skill_body: dict[str, Any] = {
        "user_id": USER_ID,
        "memory_library_id": library_id,
        "messages": [{"role": "user", "content": "会议纪要"}],
        "top_k": 10,
        "min_score": 0,
        "memory_types": ["skill"],
        "plan_version": "lite",
    }
    if skill_project_id:
        search_skill_body["project_ids"] = [skill_project_id]
    verifier.request(
        "SearchMemory skill",
        "POST",
        "/memory_nodes/search",
        body=search_skill_body,
        expected_fields=["request_id", "memory_nodes"],
    )
    verifier.request(
        "SearchMemory mixed types",
        "POST",
        "/memory_nodes/search",
        body={
            "user_id": USER_ID,
            "memory_library_id": library_id,
            "messages": [{"role": "user", "content": "提醒"}],
            "top_k": 10,
            "min_score": 0,
            "memory_types": ["observation", "skill"],
        },
    )

    first_node_id = next((node_id for node_id in verifier.created_node_ids if node_id), None)
    skill_node_id = None
    for node in listed_nodes:
        if node.get("memory_type") == "skill":
            skill_node_id = node.get("memory_node_id")
            break

    if first_node_id:
        verifier.request(
            "GetMemoryNode",
            "GET",
            f"/memory_nodes/{first_node_id}",
            expected_fields=[
                "request_id",
                "memory_node",
                "memory_node.memory_node_id",
                "memory_node.content",
                "memory_node.timestamp",
                "memory_node.created_at",
                "memory_node.updated_at",
                "memory_node.memory_type",
                "memory_node.status",
            ],
        )
        verifier.request(
            "UpdateMemory",
            "PATCH",
            f"/memory_nodes/{first_node_id}",
            body={
                "user_id": USER_ID,
                "memory_library_id": library_id,
                "custom_content": "用户下周要去上海参加 WAIC，已更新",
                "timestamp": 1747278460,
                "meta_data": {"source": "doc-verify-updated"},
            },
            expected_fields=["request_id"],
        )

    export_target = skill_node_id or first_node_id
    if export_target:
        verifier.request(
            "GetSkillExport",
            "GET",
            f"/skill/export/{export_target}",
            expected_fields=["request_id", "memory_node", "memory_node.memory_type", "memory_node.content"],
        )

    if schema_id:
        verifier.request(
            "GetUserProfile default",
            "GET",
            f"/profile_schemas/{schema_id}/user_profile",
            query={"user_id": USER_ID, "memory_library_id": library_id},
            expected_fields=["profile", "profile.attributes"],
        )
        detail = verifier.request(
            "GetUserProfile need_detail",
            "GET",
            f"/profile_schemas/{schema_id}/user_profile",
            query={"user_id": USER_ID, "memory_library_id": library_id, "need_detail": "true"},
            expected_fields=["profile", "profile.attributes"],
        )
        attributes = ((detail.get("response") or {}).get("profile") or {}).get("attributes") or []
        first_item = None
        first_attr_id = None
        for attribute in attributes:
            items = attribute.get("value_items") or []
            if items:
                first_attr_id = attribute.get("id")
                first_item = items[0]
                break
            if attribute.get("id") and first_attr_id is None:
                first_attr_id = attribute.get("id")
        if first_attr_id:
            verifier.request(
                "UpdateUserProfileValues add",
                "PATCH",
                f"/profile_schemas/{schema_id}/profile_values",
                body={
                    "memory_library_id": library_id,
                    "entity_id": USER_ID,
                    "attribute_id": first_attr_id,
                    "op_type": "add",
                    "value": "游泳",
                },
                expected_fields=["request_id"],
            )
        if first_item and first_item.get("item_id") is not None:
            verifier.request(
                "UpdateUserProfileValues update",
                "PATCH",
                f"/profile_schemas/{schema_id}/profile_values",
                body={
                    "memory_library_id": library_id,
                    "entity_id": USER_ID,
                    "attribute_id": first_attr_id,
                    "op_type": "update",
                    "item_id": first_item.get("item_id"),
                    "value": "打排球",
                },
                expected_fields=["request_id"],
            )

    # ---- cleanup ----
    unique_nodes = list(dict.fromkeys(verifier.created_node_ids))
    for node_id in unique_nodes:
        verifier.request(
            "DeleteMemory",
            "DELETE",
            f"/memory_nodes/{node_id}",
            query={"user_id": USER_ID, "memory_library_id": library_id},
            expected_fields=["request_id"],
        )
    if schema_id:
        verifier.request(
            "DeleteProfileSchema",
            "DELETE",
            f"/profile_schemas/{schema_id}",
            query={"memory_library_id": library_id},
            expected_fields=["request_id"],
        )

    REPORT_JSON.write_text(json.dumps({"calls": verifier.calls}, ensure_ascii=False, indent=2) + "\n")
    lines = [
        "# 长期记忆 API live 验证",
        "",
        f"- 时间: {time.strftime('%Y-%m-%d %H:%M:%S %z')}",
        f"- Host: `https://{{workspace_id}}.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory`",
        f"- user_id: `{USER_ID}`",
        f"- skill_project_id: `{skill_project_id or '(empty)'}`",
        f"- 调用次数: {len(verifier.calls)}",
        f"- HTTP 成功: {sum(1 for call in verifier.calls if call['ok'])}",
        f"- HTTP 失败: {sum(1 for call in verifier.calls if not call['ok'])}",
        "",
        "## 逐接口对照",
        "",
    ]
    for call in verifier.calls:
        lines.append(f"### {call['name']}")
        lines.append("")
        lines.append(f"- 路径: `{call['method']} {call['path']}`")
        lines.append(f"- HTTP: **{call['status']}** ({call['elapsed_ms']}ms)")
        if call.get("error") and not call["ok"]:
            snippet = call["error"].replace("\n", " ")[:300]
            lines.append(f"- 错误: `{snippet}`")
        if call["ok"]:
            if call["missing_vs_doc"]:
                lines.append(f"- 文档有、实际缺: `{', '.join(call['missing_vs_doc'])}`")
            else:
                lines.append("- 文档有、实际缺: 无（抽样字段均出现，或该响应无对象字段）")
            if call["extra_vs_doc"]:
                extra_preview = ", ".join(call["extra_vs_doc"][:30])
                lines.append(f"- 实际多出: `{extra_preview}`")
            else:
                lines.append("- 实际多出: 无")
        lines.append("")
        lines.append("实际响应:")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(call["response"], ensure_ascii=False, indent=2)[:4000])
        lines.append("```")
        lines.append("")

    REPORT_MD.write_text("\n".join(lines) + "\n")
    print(f"wrote {REPORT_MD}", flush=True)
    print(f"wrote {REPORT_JSON}", flush=True)
    failed = [call["name"] for call in verifier.calls if not call["ok"]]
    print("failed:" + (", ".join(failed) if failed else " none"), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
