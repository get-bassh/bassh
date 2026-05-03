"""HTTP helpers for the bassh-deploy Cowork skill.

Wraps the bassh.io REST API so the skill markdown stays declarative.
The worker accepts the same JSON body shape the bassh CLI now sends —
sensitive fields (password, otp_emails, emails, custom_domain) live in
the body, never in headers.
"""

from __future__ import annotations

import base64
import json
import secrets
import string
import urllib.parse
import urllib.request
from typing import Any, Iterable

API_BASE = "https://bassh.io"


def _request(
    method: str,
    path: str,
    api_key: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("X-API-Key", api_key)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        # bassh always returns JSON, even on errors
        payload = e.read().decode("utf-8") if e.fp else f'{{"error":"{e.reason}"}}'
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return {"success": False, "error": "non-JSON response", "raw": payload}


def _b64(s: str | bytes) -> str:
    if isinstance(s, str):
        s = s.encode("utf-8")
    return base64.b64encode(s).decode("ascii")


def random_password(length: int = 12) -> str:
    """Default password generator: alphanumeric, length-12, ~71 bits of entropy."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def deploy_html(
    html: str,
    api_key: str,
    password: str | None = None,
    otp_emails: str | None = None,
    project_name: str | None = None,
    custom_domain: str | None = None,
) -> dict[str, Any]:
    """Deploy a single-page HTML artifact and return the parsed bassh response.

    Args:
        html: full HTML document as a string.
        api_key: user's bassh API key (`sk_…`).
        password: if set, page is AES-256-GCM encrypted and gated by this password.
        otp_emails: comma-separated allowlist for magic-link login (e.g. "alice@x.com,@example.com").
        project_name: optional slug. Lowercase letters/digits/dashes, 1-58 chars.
            If None, bassh auto-generates one.
        custom_domain: optional custom domain (e.g. "preview.example.com").

    Returns: dict with `success`, `url`, `project`, `shortName` on success;
    or `success=False` with an `error` field on failure.
    """
    return deploy_files(
        files=[("index.html", html)],
        api_key=api_key,
        password=password,
        otp_emails=otp_emails,
        project_name=project_name,
        custom_domain=custom_domain,
    )


def deploy_files(
    files: Iterable[tuple[str, str | bytes]],
    api_key: str,
    password: str | None = None,
    otp_emails: str | None = None,
    project_name: str | None = None,
    custom_domain: str | None = None,
) -> dict[str, Any]:
    """Deploy multiple files. `files` is an iterable of (path, content) tuples.

    Content can be a string (encoded as utf-8) or raw bytes. Paths are relative
    to the site root. If no `index.html` is provided, bassh promotes the first
    .html file found.
    """
    payload_files = [{"path": path, "content": _b64(content)} for path, content in files]
    body: dict[str, Any] = {"files": payload_files}
    if project_name:
        body["projectName"] = project_name
    if password:
        body["password"] = password
    if otp_emails:
        body["otpEmails"] = otp_emails
    if custom_domain:
        body["customDomain"] = custom_domain
    return _request("POST", "/", api_key, body)


def list_projects(api_key: str) -> dict[str, Any]:
    """List the user's deployed projects."""
    return _request("GET", "/", api_key)


def delete_project(api_key: str, project_name: str) -> dict[str, Any]:
    """Delete a project by short name (the part after `<username>-`)."""
    encoded = urllib.parse.quote(project_name, safe="")
    return _request("DELETE", f"/?project={encoded}", api_key)


def get_forms(
    api_key: str,
    project_name: str,
    *,
    clear: bool = False,
) -> dict[str, Any]:
    """List or delete form submissions for a project.

    Pass `clear=True` only after explicit user confirmation — it deletes
    every submission for the project and is irreversible.
    """
    encoded = urllib.parse.quote(project_name, safe="")
    method = "DELETE" if clear else "GET"
    return _request(method, f"/forms?project={encoded}", api_key)


def whoami(api_key: str) -> dict[str, Any]:
    """Show which bassh account this key belongs to (sanity check)."""
    return _request("GET", "/me", api_key)
