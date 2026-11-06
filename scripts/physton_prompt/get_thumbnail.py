# -*- coding: UTF-8 -*-

import hashlib
import os
import tempfile
import time
from urllib.parse import parse_qs, urlparse

from PIL import Image, ImageOps

# Cards are 100x120 and use object-fit: cover, so 256 stays sharp on 2x displays.
THUMBNAIL_SHORT_SIDE = 256
# GIF and video previews are left out so that they keep their original behavior.
THUMBNAIL_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.avif', '.jxl', '.heif'}
CACHE_MAX_AGE = 30 * 24 * 60 * 60
CACHE_DIR = os.path.join(tempfile.gettempdir(), 'sd-webui-prompt-all-in-one-neo-thumbnails')

# Only files registered while listing extra networks can be served by key.
_sources = {}
_cache_pruned = False


def _get_preview_source(preview):
    if not preview:
        return None
    parsed = urlparse(preview)
    if not parsed.path.endswith('sd_extra_networks/thumb'):
        return None
    filenames = parse_qs(parsed.query).get('filename')
    return os.path.normpath(filenames[0]) if filenames else None


def get_thumbnail_url(preview):
    source = _get_preview_source(preview)
    if not source or os.path.splitext(source)[1].lower() not in THUMBNAIL_EXTENSIONS:
        return None
    try:
        stat = os.stat(source)
    except OSError:
        return None
    key_source = f'{source}|{stat.st_mtime_ns}|{stat.st_size}|{THUMBNAIL_SHORT_SIDE}'
    key = hashlib.md5(key_source.encode('utf-8')).hexdigest()
    _sources[key] = source
    return f'./physton_prompt/thumbnail?key={key}'


def get_thumbnail_file(key):
    source = _sources.get(key)
    if not source or not os.path.isfile(source):
        return None
    _prune_cache()
    cache_path = os.path.join(CACHE_DIR, f'{key}.webp')
    if os.path.isfile(cache_path):
        try:
            os.utime(cache_path)
        except OSError:
            pass
        return cache_path
    return cache_path if _generate_thumbnail(source, cache_path) else source


def _generate_thumbnail(source, cache_path):
    temp_path = None
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with Image.open(source) as original:
            if getattr(original, 'is_animated', False):
                return False
            image = ImageOps.exif_transpose(original)
            width, height = image.size
            scale = THUMBNAIL_SHORT_SIDE / min(width, height)
            if scale < 1:
                image.thumbnail((round(width * scale), round(height * scale)), Image.LANCZOS)
            if image.mode not in ('RGB', 'RGBA'):
                has_alpha = image.mode in ('LA', 'PA') or 'transparency' in image.info
                image = image.convert('RGBA' if has_alpha else 'RGB')
            file, temp_path = tempfile.mkstemp(dir=CACHE_DIR, suffix='.tmp')
            os.close(file)
            image.save(temp_path, 'WEBP', quality=85)
        os.replace(temp_path, cache_path)
        temp_path = None
        return True
    except Exception as e:
        print(f'[sd-webui-prompt-all-in-one] thumbnail error for {source}: {e}')
        return False
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass


def _prune_cache():
    global _cache_pruned
    if _cache_pruned:
        return
    _cache_pruned = True
    oldest_allowed = time.time() - CACHE_MAX_AGE
    try:
        with os.scandir(CACHE_DIR) as entries:
            for entry in entries:
                try:
                    if entry.is_file() and entry.stat().st_mtime < oldest_allowed:
                        os.remove(entry.path)
                except OSError:
                    pass
    except OSError:
        pass
