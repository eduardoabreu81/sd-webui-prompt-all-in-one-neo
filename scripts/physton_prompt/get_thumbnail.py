# -*- coding: UTF-8 -*-

import os
import time
import hashlib
import cv2
from PIL import Image
from pathlib import Path

THUMBNAIL_CACHE_DIR = '/tmp/sd-webui-prompt-all-in-one-thumbnails/'
CACHE_TTL = 86400  # 24 hours
MAX_THUMBNAIL_SIZE = 400


def ensure_cache_dir():
    os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)


def generate_cache_key(file_path, width, height):
    key_str = f"{file_path}_{width}_{height}"
    return hashlib.md5(key_str.encode()).hexdigest()


def get_cache_path(file_path, width, height):
    cache_key = generate_cache_key(file_path, width, height)
    return os.path.join(THUMBNAIL_CACHE_DIR, f"{cache_key}.webp")


def is_cache_valid(cache_path):
    if not os.path.exists(cache_path):
        return False
    file_age = time.time() - os.path.getmtime(cache_path)
    return file_age < CACHE_TTL


def extract_frame_from_mp4(mp4_path):
    if not os.path.exists(mp4_path):
        return None
    try:
        cap = cv2.VideoCapture(mp4_path)
        if not cap.isOpened():
            return None
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames == 0:
            cap.release()
            return None
        frame_idx = total_frames // 2
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        cap.release()
        if not ret:
            return None
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(frame_rgb)
        return img
    except Exception as e:
        print(f'[sd-webui-prompt-all-in-one] MP4 frame extraction error: {e}')
        return None


def resize_image(image, width, height):
    if image is None:
        return None
    try:
        original_width, original_height = image.size
        min_dim = min(original_width, original_height)
        scale = min(width, height) / min_dim
        new_width = int(original_width * scale)
        new_height = int(original_height * scale)
        image = image.resize((new_width, new_height), Image.LANCZOS)
        aspect_ratio = width / height
        orig_aspect = new_width / new_height
        if orig_aspect > aspect_ratio:
            crop_x = (new_width - int(new_height * aspect_ratio)) // 2
            crop_y = 0
            crop_w = int(new_height * aspect_ratio)
            crop_h = new_height
        else:
            crop_x = 0
            crop_y = (new_height - int(new_width / aspect_ratio)) // 2
            crop_w = new_width
            crop_h = int(new_width / aspect_ratio)
        image = image.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))
        return image
    except Exception as e:
        print(f'[sd-webui-prompt-all-in-one] Image resize error: {e}')
        return None


def generate_thumbnail(file_path, width=200, height=200):
    ensure_cache_dir()
    file_path = os.path.normpath(file_path)
    if not os.path.exists(file_path):
        return None
    cache_path = get_cache_path(file_path, width, height)
    if is_cache_valid(cache_path):
        return cache_path
    try:
        ext = os.path.splitext(file_path)[1].lower()
        image = None
        actual_file_path = file_path
        if ext in ['.mp4', '.avi', '.mov', '.mkv', '.webm']:
            image = extract_frame_from_mp4(file_path)
        elif ext in ['.safetensors', '.pt', '.pth', '.bin', '.gguf', '.onnx', '.bin']:
            preview_path = get_preview_path(file_path)
            if preview_path and os.path.exists(preview_path):
                actual_file_path = preview_path
                preview_ext = os.path.splitext(preview_path)[1].lower()
                if preview_ext in ['.mp4', '.avi', '.mov', '.mkv', '.webm']:
                    image = extract_frame_from_mp4(preview_path)
                else:
                    try:
                        image = Image.open(preview_path)
                        image.load()
                    except Exception as e:
                        print(f'[sd-webui-prompt-all-in-one] Preview image open error: {e}')
                        image = None
            if not image:
                return None
        if not image:
            try:
                image = Image.open(file_path)
                image.load()
            except Exception as e:
                print(f'[sd-webui-prompt-all-in-one] Image open error: {e}')
                return None
        if image is None:
            return None
        resized = resize_image(image, width, height)
        if resized is None:
            return None
        cache_ext = '.webp'
        final_cache_path = os.path.join(THUMBNAIL_CACHE_DIR, f"{generate_cache_key(actual_file_path, width, height)}{cache_ext}")
        resized.save(final_cache_path, 'WEBP', quality=85)
        return final_cache_path
    except Exception as e:
        print(f'[sd-webui-prompt-all-in-one] Thumbnail generation error: {e}')
        return None


def get_cache_stats():
    ensure_cache_dir()
    total_files = 0
    total_size = 0
    cache_files = []
    try:
        for f in os.listdir(THUMBNAIL_CACHE_DIR):
            full_path = os.path.join(THUMBNAIL_CACHE_DIR, f)
            if os.path.isfile(full_path):
                total_files += 1
                file_size = os.path.getsize(full_path)
                total_size += file_size
                mtime = os.path.getmtime(full_path)
                age_hours = (time.time() - mtime) / 3600
                cache_files.append({
                    'filename': f,
                    'size': file_size,
                    'age_hours': round(age_hours, 1)
                })
    except Exception as e:
        pass
    return {
        'total_files': total_files,
        'total_size': total_size,
        'cache_dir': THUMBNAIL_CACHE_DIR,
        'files': sorted(cache_files, key=lambda x: x['age_hours'], reverse=True)
    }


def clear_cache():
    ensure_cache_dir()
    cleared_count = 0
    cleared_size = 0
    try:
        for f in os.listdir(THUMBNAIL_CACHE_DIR):
            full_path = os.path.join(THUMBNAIL_CACHE_DIR, f)
            if os.path.isfile(full_path):
                cleared_count += 1
                cleared_size += os.path.getsize(full_path)
                os.remove(full_path)
    except Exception as e:
        print(f'[sd-webui-prompt-all-in-one] Clear cache error: {e}')
    return {
        'cleared_files': cleared_count,
        'cleared_size': cleared_size
    }


def parse_thumb_url(url):
    if not url or 'thumb?filename=' not in url:
        return None
    try:
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        if 'filename' in params:
            return params['filename'][0]
    except Exception as e:
        print(f'[sd-webui-prompt-all-in-one] Parse thumb URL error: {e}')
    return None


def get_preview_path(file_path):
    file_path = os.path.normpath(file_path)
    base, ext = os.path.splitext(file_path)
    preview_extensions = ['.preview.webp', '.preview.png', '.preview.jpg', '.preview.jpeg',
                         '.jpeg', '.jpg', '.png', '.webp', '.mp4', '.mov', '.avi', '.mkv']
    for preview_ext in preview_extensions:
        preview_path = base + preview_ext
        if os.path.exists(preview_path):
            return preview_path
    preview_path = file_path + '.preview.webp'
    if os.path.exists(preview_path):
        return preview_path
    return None
