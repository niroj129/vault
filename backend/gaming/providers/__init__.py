from .agentserver import AgentServerAdapter
from .ashx import AshxAdapter
from .base import Adapter, ApiError, NotSupported, Result, egress_ip, make_account, make_password
from .external import ExternalAdapter
from .fastapi import FastApiAdapter

ADAPTERS = {
    "external": ExternalAdapter,
    "agentserver": AgentServerAdapter,
    "ashx": AshxAdapter,
    "fastapi": FastApiAdapter,
    "manual": Adapter,
}

# which provider fields each kind uses (drives the admin form)
FIELDS = {
    "external": ["base_url", "agent_name", "secret_key", "token_upper", "ms_timestamp"],
    "agentserver": ["base_url", "agent_name", "agent_password"],
    "ashx": ["base_url", "agent_name", "agent_password"],
    "fastapi": ["base_url", "app_id", "secret_key", "agent_name", "agent_password"],
    "manual": [],
}


def adapter_for(provider):
    return ADAPTERS.get(provider.kind, Adapter)(provider)


__all__ = ["ADAPTERS", "FIELDS", "Adapter", "ApiError", "NotSupported", "Result",
           "adapter_for", "egress_ip", "make_account", "make_password"]
