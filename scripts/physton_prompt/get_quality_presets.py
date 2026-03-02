import os
import json
import struct
import requests

from scripts.physton_prompt.storage import Storage

# ---------------------------------------------------------------------------
# Storage key
# ---------------------------------------------------------------------------
STORAGE_KEY = 'qualityPresets'

DEFAULT_PRESETS = {
    'presets': [],
    'api_key': '',
}

# ---------------------------------------------------------------------------
# Built-in template mapping  CivitAI baseModel  →  quality tag blocks
# Source: user-confirmed mapping (session context)
# ---------------------------------------------------------------------------
BUILTIN_TEMPLATES = {
    'Pony':        {'positive_prefix': ['score_9', 'score_8_up', 'score_7_up'], 'negative_prefix': []},
    'Illustrious': {'positive_prefix': ['masterpiece', 'best quality'], 'negative_prefix': []},
    'NoobAI':      {'positive_prefix': ['masterpiece', 'best quality'], 'negative_prefix': []},
    'SDXL 1.0':   {'positive_prefix': ['masterpiece', 'best quality'], 'negative_prefix': []},
    'SDXL Turbo':  {'positive_prefix': ['masterpiece', 'best quality'], 'negative_prefix': []},
    'SD 1.5':      {'positive_prefix': ['masterpiece', 'best quality'], 'negative_prefix': []},
    'SD 2.1':      {'positive_prefix': ['masterpiece', 'best quality'], 'negative_prefix': []},
    'FLUX.1 D':    {'positive_prefix': [], 'negative_prefix': []},
    'FLUX.1 S':    {'positive_prefix': [], 'negative_prefix': []},
}

# ---------------------------------------------------------------------------
# Helpers: read SHA-256 from a safetensors file
# ---------------------------------------------------------------------------

def _read_safetensors_header(filepath: str) -> dict:
    """Return the parsed JSON header of a safetensors file, or {}."""
    try:
        with open(filepath, 'rb') as f:
            length_bytes = f.read(8)
            if len(length_bytes) < 8:
                return {}
            header_length = struct.unpack('<Q', length_bytes)[0]
            if header_length > 100 * 1024 * 1024:   # sanity: > 100 MB is wrong
                return {}
            header_bytes = f.read(header_length)
            return json.loads(header_bytes.decode('utf-8'))
    except Exception:
        return {}


def get_sha256_from_file(filepath: str) -> str:
    """
    Try to obtain the SHA-256 hash for a checkpoint file.
    Priority:
      1. modelspec.hash_sha256 inside safetensors __metadata__
      2. .sha256 sidecar file (written by Forge / A1111 after first load)
    Returns uppercase hex string or '' if unavailable.
    """
    # 1. safetensors metadata
    if filepath.lower().endswith('.safetensors'):
        header = _read_safetensors_header(filepath)
        meta = header.get('__metadata__', {})
        sha = meta.get('modelspec.hash_sha256', '')
        if sha:
            return sha.upper().strip()

    # 2. sidecar .sha256 file
    sidecar = os.path.splitext(filepath)[0] + '.sha256'
    if os.path.exists(sidecar):
        try:
            return open(sidecar).read().strip().upper()
        except Exception:
            pass

    return ''


# ---------------------------------------------------------------------------
# CivitAI API lookup
# ---------------------------------------------------------------------------

def _civitai_headers(api_key: str = '') -> dict:
    """
    Build request headers for CivitAI API calls.
    Uses a browser-style User-Agent to bypass Cloudflare (error 1010).
    Based on the pattern from sd-civitai-browser-neo/scripts/civitai_api.py.
    """
    headers = {
        'Connection': 'keep-alive',
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/121.0.0.0 Safari/537.36'
        ),
        'Content-Type': 'application/json',
    }
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    return headers


def fetch_base_model_from_civitai(sha256: str, api_key: str = '') -> str:
    """
    Query CivitAI /api/v1/model-versions/by-hash/{sha256}.
    Returns the raw baseModel string (e.g. 'NoobAI', 'Pony') or '' on failure.
    """
    if not sha256 or len(sha256) != 64:
        return ''
    url = f'https://civitai.com/api/v1/model-versions/by-hash/{sha256}'
    try:
        resp = requests.get(url, headers=_civitai_headers(api_key), timeout=(15, 30))
        if resp.status_code == 200:
            data = resp.json()
            if 'error' not in data:
                return data.get('baseModel', '')
    except Exception:
        pass
    return ''


# ---------------------------------------------------------------------------
# Preset storage helpers
# ---------------------------------------------------------------------------

def load_presets() -> dict:
    data = Storage.get(STORAGE_KEY)
    if not isinstance(data, dict):
        return dict(DEFAULT_PRESETS)
    # Ensure both keys exist
    data.setdefault('presets', [])
    data.setdefault('api_key', '')
    return data


def save_presets(data: dict) -> None:
    Storage.set(STORAGE_KEY, data)


# ---------------------------------------------------------------------------
# Core detection: given a checkpoint filepath, resolve the matching preset
# or fall back to a built-in template.
# ---------------------------------------------------------------------------

def detect_preset_for_checkpoint(filepath: str) -> dict:
    """
    Examine the checkpoint at `filepath` and return the best-matching quality
    preset as a dict:

        {
            'source':           'civitai' | 'preset' | 'builtin' | 'none',
            'base_model':       str,        # raw CivitAI baseModel value or ''
            'preset_name':      str,        # name of matched user preset or ''
            'positive_prefix':  [str, ...],
            'negative_prefix':  [str, ...],
            'positive_embeddings': [str, ...],
            'negative_embeddings': [str, ...],
            'auto_insert':      bool,
        }

    Detection order:
      1. SHA-256  →  CivitAI by-hash  →  built-in template
      2. Filename substring  →  user preset match_substr
      3. No match → source='none', empty tag lists
    """
    result = {
        'source': 'none',
        'base_model': '',
        'preset_name': '',
        'positive_prefix': [],
        'negative_prefix': [],
        'positive_embeddings': [],
        'negative_embeddings': [],
        'auto_insert': False,
    }

    if not filepath or not os.path.exists(filepath):
        return result

    filename_stem = os.path.splitext(os.path.basename(filepath))[0].lower()

    storage = load_presets()
    user_presets = storage.get('presets', [])
    api_key = storage.get('api_key', '')

    # -- Step 1a: exact filename match in user presets ----------------------
    for preset in user_presets:
        exact_list = [e.lower() for e in preset.get('match_exact', [])]
        if filename_stem in exact_list:
            result.update({
                'source': 'preset',
                'preset_name': preset.get('name', ''),
                'positive_prefix': preset.get('positive_prefix', []),
                'negative_prefix': preset.get('negative_prefix', []),
                'positive_embeddings': preset.get('positive_embeddings', []),
                'negative_embeddings': preset.get('negative_embeddings', []),
                'auto_insert': preset.get('auto_insert', False),
            })
            return result

    # -- Step 1b: CivitAI SHA-256 lookup ------------------------------------
    sha256 = get_sha256_from_file(filepath)
    base_model = ''
    if sha256:
        base_model = fetch_base_model_from_civitai(sha256, api_key)

    if base_model:
        result['base_model'] = base_model
        # Check if any user preset overrides this base model family
        for preset in user_presets:
            substr_list = [s.lower() for s in preset.get('match_substr', [])]
            if any(s in filename_stem for s in substr_list):
                result.update({
                    'source': 'preset',
                    'preset_name': preset.get('name', ''),
                    'positive_prefix': preset.get('positive_prefix', []),
                    'negative_prefix': preset.get('negative_prefix', []),
                    'positive_embeddings': preset.get('positive_embeddings', []),
                    'negative_embeddings': preset.get('negative_embeddings', []),
                    'auto_insert': preset.get('auto_insert', False),
                })
                return result

        # Fall back to built-in template for this baseModel
        template = BUILTIN_TEMPLATES.get(base_model)
        if template:
            result.update({
                'source': 'civitai',
                'positive_prefix': template['positive_prefix'],
                'negative_prefix': template['negative_prefix'],
                'auto_insert': False,   # built-in templates are suggested, not auto-inserted
            })
            return result

    # -- Step 2: filename substring match against user presets --------------
    for preset in user_presets:
        substr_list = [s.lower() for s in preset.get('match_substr', [])]
        if any(s in filename_stem for s in substr_list):
            result.update({
                'source': 'preset',
                'preset_name': preset.get('name', ''),
                'positive_prefix': preset.get('positive_prefix', []),
                'negative_prefix': preset.get('negative_prefix', []),
                'positive_embeddings': preset.get('positive_embeddings', []),
                'negative_embeddings': preset.get('negative_embeddings', []),
                'auto_insert': preset.get('auto_insert', False),
            })
            return result

    # -- No match -----------------------------------------------------------
    return result


# ---------------------------------------------------------------------------
# WebUI integration: resolve the currently loaded checkpoint path
# ---------------------------------------------------------------------------

def get_current_checkpoint_path() -> str:
    """
    Return the absolute path to the currently loaded checkpoint, or ''.
    Works with Forge Neo / A1111 / SD.Next.
    """
    try:
        from modules import shared, sd_models
        name = getattr(shared.opts, 'sd_model_checkpoint', '')
        if not name:
            return ''
        info = sd_models.get_closet_checkpoint_match(name)
        if info and hasattr(info, 'filename'):
            return info.filename
    except Exception:
        pass
    return ''
