from __future__ import annotations

from collections import UserDict, deque
from types import MappingProxyType

import pytest

from app.web.server import DebugLogHandler


@pytest.fixture
def handler() -> DebugLogHandler:
    return DebugLogHandler()


def test_build_key_handles_nested_unhashable_structures(handler: DebugLogHandler) -> None:
    context = {
        "attrs": MappingProxyType({
            "numbers": [1, 2, 3],
            "details": {"enabled": True, "thresholds": {"low", "high"}},
        }),
        "extra": UserDict({"history": deque(({"event": "start"}, {"event": "stop"}))}),
    }
    payload = {"meta": {"ids": [1, {"sub": ("a", "b")}]}}
    correlation = {"request_id": "abc123"}

    key = handler._build_key("TEST", "message", context, payload, correlation)

    # Key should be usable as a dictionary key (i.e. hashable) even with nested structures.
    try:
        hash(key)
    except TypeError as exc:  # pragma: no cover - the assertion below would fail first
        pytest.fail(f"Key is not hashable: {exc}")


def test_build_key_is_order_insensitive(handler: DebugLogHandler) -> None:
    context_a = {"values": {"b": 2, "a": 1}}
    context_b = {"values": {"a": 1, "b": 2}}

    key_a = handler._build_key("TEST", "message", context_a, {}, {})
    key_b = handler._build_key("TEST", "message", context_b, {}, {})

    assert key_a == key_b
