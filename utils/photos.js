// The classic tasting triptych, in the order photos are stored and shown.
// Mirrors PHOTO_SLOTS / orderPhotos in tea-taste-frontend/src/components/TeaPhotos.jsx:
// the sitemap, the preview image and the crawler HTML all have to pick the same
// first photo the card does, or a shared link shows a picture that is not on
// the page.
const PHOTO_KINDS = ['dry', 'liquor', 'wet'];

const orderedPhotoUrls = (photos) => {
  const list = Array.isArray(photos) ? photos : [];
  return PHOTO_KINDS
    .map((kind) => list.find((p) => p && p.url && p.kind === kind))
    .filter(Boolean)
    .map((p) => p.url);
};

// The card thumbnail and the og:image — the first filled slot, or ''.
const previewPhotoUrl = (photos) => orderedPhotoUrls(photos)[0] || '';

module.exports = { PHOTO_KINDS, orderedPhotoUrls, previewPhotoUrl };
