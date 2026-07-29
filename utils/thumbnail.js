const path = require('path');
const fs = require('fs');

const { uploadDir } = require('../middlewares/upload');

// A small WebP beside every uploaded tea photo.
//
// Uploads are stored at 1600px and the feed renders them at 130px, so a feed of
// ten tastings downloads several megabytes to display a row of thumbnails. The
// original is kept untouched for the full-screen viewer and the link preview.
//
// sharp is required lazily and optionally, the same way ffmpeg is treated for
// voice notes: it ships native binaries, the API runs on alpine, and a photo
// upload failing because a thumbnail could not be made would be a worse
// outcome than a page that loads the original. Without it, `thumbFor` returns
// nothing and every caller falls back to the full-size image.
let sharp = null;
let sharpChecked = false;

const loadSharp = () => {
  if (sharpChecked) return sharp;
  sharpChecked = true;
  try {
    // eslint-disable-next-line global-require
    sharp = require('sharp');
  } catch (err) {
    console.warn('sharp not available — tea photos will be served full size:', err.message);
    sharp = null;
  }
  return sharp;
};

// The feed shows these at 130 CSS px; 320 covers a 2x display with room to
// spare and still lands around 15-25 KB.
const THUMB_WIDTH = 320;
const THUMB_SUFFIX = '-thumb.webp';

const thumbName = (filename) => `${path.parse(filename).name}${THUMB_SUFFIX}`;

// Returns the thumbnail's filename, or '' if one could not be made. Never
// throws: the upload it belongs to has already succeeded by this point.
const makeThumb = async (filename) => {
  const lib = loadSharp();
  if (!lib) return '';

  const source = path.join(uploadDir, filename);
  const target = path.join(uploadDir, thumbName(filename));

  try {
    await lib(source)
      // withoutEnlargement: a photo already smaller than 320px is re-encoded to
      // WebP but not blown up into a blurry copy of itself.
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(target);
    return thumbName(filename);
  } catch (err) {
    console.warn(`Could not thumbnail ${filename}:`, err.message);
    // A partial file left behind by a failed encode would be served as a broken
    // image, which is worse than having no thumbnail at all.
    await fs.promises.unlink(target).catch(() => {});
    return '';
  }
};

// Best-effort cleanup, for when the photo it belongs to is deleted.
const removeThumb = (filename) => fs.promises
  .unlink(path.join(uploadDir, thumbName(filename)))
  .catch(() => {});

module.exports = {
  makeThumb, removeThumb, thumbName, THUMB_WIDTH, THUMB_SUFFIX,
};
