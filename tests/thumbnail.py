# Run from the repository root: python tests/thumbnail.py
import os
import sys
import tempfile
import time
import unittest
from urllib.parse import quote

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from PIL import Image

from scripts.physton_prompt import get_thumbnail as thumbnail


def preview_url(path):
    return f'./sd_extra_networks/thumb?filename={quote(path.replace(os.sep, "/"))}&mtime=1'


class ThumbnailTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.original_cache_dir = thumbnail.CACHE_DIR
        thumbnail.CACHE_DIR = os.path.join(self.directory.name, 'cache')
        thumbnail._cache_pruned = False
        thumbnail._sources.clear()
        self.addCleanup(setattr, thumbnail, 'CACHE_DIR', self.original_cache_dir)

    def make_image(self, name, size=(1000, 1500), **save_options):
        path = os.path.join(self.directory.name, name)
        Image.new('RGB', size, (200, 40, 40)).save(path, **save_options)
        return path

    def key_for(self, path):
        url = thumbnail.get_thumbnail_url(preview_url(path))
        self.assertIsNotNone(url)
        self.assertTrue(url.startswith('./physton_prompt/thumbnail?key='))
        return url.rsplit('=', 1)[1]

    def test_keeps_aspect_ratio_and_reduces_short_side(self):
        file = thumbnail.get_thumbnail_file(self.key_for(self.make_image('tall.png')))
        with Image.open(file) as image:
            self.assertEqual(image.format, 'WEBP')
            self.assertEqual(image.size, (256, 384))

    def test_does_not_upscale_small_images(self):
        file = thumbnail.get_thumbnail_file(self.key_for(self.make_image('small.png', size=(80, 120))))
        with Image.open(file) as image:
            self.assertEqual(image.size, (80, 120))

    def test_applies_exif_orientation(self):
        exif = Image.Exif()
        exif[0x0112] = 6
        file = thumbnail.get_thumbnail_file(self.key_for(self.make_image('rotated.jpg', exif=exif)))
        with Image.open(file) as image:
            self.assertEqual(image.size, (384, 256))

    def test_preserves_transparency(self):
        path = os.path.join(self.directory.name, 'alpha.png')
        Image.new('RGBA', (500, 500), (10, 20, 30, 0)).save(path)
        with Image.open(thumbnail.get_thumbnail_file(self.key_for(path))) as image:
            self.assertEqual(image.convert('RGBA').getpixel((10, 10))[3], 0)

    def test_unknown_key_is_rejected(self):
        self.assertIsNone(thumbnail.get_thumbnail_file('../../secret'))
        self.assertIsNone(thumbnail.get_thumbnail_file('0' * 32))

    def test_changed_source_gets_a_new_key(self):
        path = self.make_image('changed.png')
        first = self.key_for(path)
        os.utime(path, (time.time() + 60, time.time() + 60))
        self.assertNotEqual(first, self.key_for(path))

    def test_animated_webp_falls_back_to_source(self):
        path = os.path.join(self.directory.name, 'animated.webp')
        frames = [Image.new('RGB', (300, 300), color) for color in ('red', 'blue')]
        frames[0].save(path, save_all=True, append_images=frames[1:], duration=100)
        self.assertEqual(os.path.normpath(thumbnail.get_thumbnail_file(self.key_for(path))), os.path.normpath(path))

    def test_broken_image_falls_back_to_source(self):
        path = os.path.join(self.directory.name, 'broken.png')
        with open(path, 'wb') as file:
            file.write(b'not an image')
        self.assertEqual(os.path.normpath(thumbnail.get_thumbnail_file(self.key_for(path))), os.path.normpath(path))
        self.assertEqual([name for name in os.listdir(thumbnail.CACHE_DIR) if name.endswith('.tmp')], [])

    def test_unsupported_previews_have_no_thumbnail(self):
        self.assertIsNone(thumbnail.get_thumbnail_url(None))
        self.assertIsNone(thumbnail.get_thumbnail_url('./sd_extra_networks/cover-images?filename=model.safetensors'))
        self.assertIsNone(thumbnail.get_thumbnail_url('./file=html/card-no-preview.png'))
        for name in ('anim.gif', 'clip.mp4'):
            path = os.path.join(self.directory.name, name)
            open(path, 'wb').close()
            self.assertIsNone(thumbnail.get_thumbnail_url(preview_url(path)))

    def test_prunes_only_old_cache_files(self):
        os.makedirs(thumbnail.CACHE_DIR)
        old = os.path.join(thumbnail.CACHE_DIR, 'old.webp')
        recent = os.path.join(thumbnail.CACHE_DIR, 'recent.webp')
        for path in (old, recent):
            open(path, 'wb').close()
        expired = time.time() - thumbnail.CACHE_MAX_AGE - 60
        os.utime(old, (expired, expired))
        thumbnail._prune_cache()
        self.assertFalse(os.path.exists(old))
        self.assertTrue(os.path.exists(recent))


if __name__ == '__main__':
    unittest.main()
