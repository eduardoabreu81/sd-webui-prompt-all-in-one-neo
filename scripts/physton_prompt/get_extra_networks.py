# -*- coding: UTF-8 -*-

from modules import script_callbacks, extra_networks, prompt_parser, shared, ui_extra_networks
import json
import os
from urllib.parse import urlparse, parse_qs

filters = [
    'search_term',
    'local_preview',
    'metadata',
]


def parse_thumb_url(url):
    if not url or 'thumb?filename=' not in url:
        return None
    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        if 'filename' in params:
            return params['filename'][0]
    except Exception as e:
        pass
    return None


def generate_thumbnail_for_file(file_path, width=200, height=200):
    from scripts.physton_prompt.get_thumbnail import (
        generate_thumbnail, get_cache_path, is_cache_valid,
        get_preview_path, parse_thumb_url
    )
    if not file_path:
        return None
    cache_path = get_cache_path(file_path, width, height)
    if is_cache_valid(cache_path):
        return cache_path
    try:
        preview_path = get_preview_path(file_path)
        if preview_path and os.path.exists(preview_path):
            generated = generate_thumbnail(preview_path, width, height)
            if generated:
                return generated
        generated = generate_thumbnail(file_path, width, height)
        return generated
    except Exception as e:
        return None


def get_thumbnail_url(cache_path, width=200, height=200):
    if not cache_path:
        return None
    import os
    if os.path.exists(cache_path):
        cache_filename = os.path.basename(cache_path)
        return f"/physton_prompt/thumbnail?filename={cache_filename}"
    return None


def _parse_item(item, thumbnail_width=None, thumbnail_height=None):
    output_name = None
    try:
        if 'metadata' in item and item['metadata']:
            metadata = json.loads(item['metadata'])
            if metadata and 'ss_output_name' in metadata:
                output_name = metadata['ss_output_name']
    except Exception:
        pass
    item['output_name'] = output_name

    item['civitai_info'] = {}
    try:
        if 'filename' in item and item['filename']:
            item['basename'] = os.path.basename(item['filename'])
            item['dirname'] = os.path.dirname(item['filename'])
            base, ext = os.path.splitext(item['filename'])
            info_file = base + '.civitai.info'
            if not os.path.isfile(info_file):
                info_file = item['filename'] + '.civitai.info'
            if os.path.isfile(info_file):
                with open(info_file, 'r') as f:
                    info = json.load(f)
                    images = info.get('images', [])
                    info = {
                        'modelId': info.get('modelId', ''),
                        'name': info.get('name', ''),
                        'description': info.get('description', ''),
                        'baseModel': info.get('baseModel', ''),
                        'model': info.get('model', {}),
                        'trainedWords': info.get('trainedWords', []),
                        'images': [],
                    }
                    if images and len(images) > 0:
                        for image in images:
                            info['images'].append(image['url'])
                    item['civitai_info'] = info
    except Exception:
        pass

    if thumbnail_width and thumbnail_height:
        try:
            filename = item.get('filename', '')
            if filename:
                thumb_path = generate_thumbnail_for_file(filename, int(thumbnail_width), int(thumbnail_height))
                if thumb_path:
                    item['thumbnail'] = get_thumbnail_url(thumb_path, int(thumbnail_width), int(thumbnail_height))
        except Exception:
            pass

    newItem = {}
    for key in item:
        if key not in filters:
            newItem[key] = item[key]

    return newItem


def get_extra_networks_dirs():
    def get_same_prefix_path(paths):
        if not paths:
            return ''
        normalized = [os.path.normpath(p.replace('\\', '/')) for p in paths]
        if not normalized:
            return ''
        parts_a = normalized[0].split('/')
        min_len = min(len(p.split('/')) for p in normalized)
        for i in range(min_len):
            if all(p.split('/')[i] == parts_a[i] for p in normalized):
                if i == min_len - 1:
                    return '/'.join(parts_a[:min_len])
            else:
                if i > 0:
                    return '/'.join(parts_a[:i])
                return ''
        return normalized[0]

    result = []
    try:
        for extra_page in list(ui_extra_networks.extra_pages):
            dir_map = {}
            for item in list(extra_page.list_items()):
                dirname = os.path.dirname(item.get('filename', ''))
                if dirname not in dir_map:
                    dir_map[dirname] = True

            all_dirs = sorted(dir_map.keys())
            if not all_dirs:
                result.append({
                    'name': extra_page.name,
                    'title': extra_page.title,
                    'dirs': [],
                })
                continue

            prefix_path = get_same_prefix_path(all_dirs)
            relative_dirs = []
            for d in all_dirs:
                norm_d = os.path.normpath(d.replace('\\', '/'))
                norm_prefix = os.path.normpath(prefix_path.replace('\\', '/'))
                rel = norm_d.replace(norm_prefix, '')
                if rel == '':
                    rel = '@root'
                rel = rel.lstrip('/')
                if rel and rel not in relative_dirs:
                    relative_dirs.append(rel)

            relative_dirs.sort()
            result.append({
                'name': extra_page.name,
                'title': extra_page.title,
                'dirs': relative_dirs,
            })
    except Exception as e:
        print(f'[sd-webui-prompt-all-in-one] get_extra_networks_dirs error: {e}')
    return result


def get_extra_networks_items(name=None, dirname=None, thumbnail_width=None, thumbnail_height=None):
    def get_same_prefix_path(paths):
        if not paths:
            return ''
        normalized = [os.path.normpath(p.replace('\\', '/')) for p in paths]
        if not normalized:
            return ''
        parts_a = normalized[0].split('/')
        min_len = min(len(p.split('/')) for p in normalized)
        for i in range(min_len):
            if all(p.split('/')[i] == parts_a[i] for p in normalized):
                if i == min_len - 1:
                    return '/'.join(parts_a[:min_len])
            else:
                if i > 0:
                    return '/'.join(parts_a[:i])
                return ''
        return normalized[0]

    result = []
    try:
        pages = ui_extra_networks.extra_pages
        if name:
            pages = [p for p in pages if p.name == name]
            if not pages:
                return result

        for extra_page in pages:
            result_item = {
                'name': extra_page.name,
                'title': extra_page.title,
                'items': []
            }

            all_items = list(extra_page.list_items())
            
            all_dirs = [os.path.normpath(os.path.dirname(i.get('filename', '')).replace('\\', '/')) for i in all_items if i.get('filename')]
            prefix_path = get_same_prefix_path(all_dirs)

            if dirname is not None:
                if dirname == '@root':
                    target_dir = os.path.normpath(prefix_path)
                else:
                    target_dir = os.path.normpath(os.path.join(prefix_path, dirname))
                
                filtered = []
                for i in all_items:
                    item_dir = os.path.normpath(os.path.dirname(i.get('filename', '')).replace('\\', '/'))
                    if item_dir == target_dir:
                        filtered.append(i)
                all_items = filtered

            for item in all_items:
                newItem = _parse_item(item, thumbnail_width, thumbnail_height)
                result_item['items'].append(newItem)

            result.append(result_item)
    except Exception as e:
        import traceback
        print(f'[sd-webui-prompt-all-in-one] get_extra_networks_items error: {e}')
        traceback.print_exc()
    return result


def get_extra_networks(thumbnail_width=None, thumbnail_height=None):
    import sys
    result = []
    try:
        for extra_page in list(ui_extra_networks.extra_pages):
            result_item = {
                'name': extra_page.name,
                'title': extra_page.title,
                'items': []
            }
            for oriItem in list(extra_page.list_items()):
                newItem = _parse_item(oriItem, thumbnail_width, thumbnail_height)
                result_item['items'].append(newItem)

            result.append(result_item)
    except Exception as e:
        print(f'[sd-webui-prompt-all-in-one] get_extra_networks error: {e}')
        pass
    return result
