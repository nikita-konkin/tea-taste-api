const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    nameRU: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 60,
    },
    country: {
      type: String,
      required: false,
      minlength: 2,
      maxlength: 60,
    },
    shop: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 60,
    },
    weight: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 60,
    },
    water: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 60,
    },
    volume: {
      type: Number,
      required: true,
    },
    temperature: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    brewingtype: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 60,
    },
    teaware: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 60,
    },
    publicAccess: {
      type: Boolean,
      required: true,
    },

    // The taster's own words about the tea as a whole, as opposed to the
    // per-пролив `description` on a Brewing. Same 2000 characters as that
    // one — it is the same kind of text, written about the whole session.
    description: {
      type: String,
      required: false,
      maxlength: 2000,
    },

    // The dry leaf is smelled before any water touches it, so its aroma belongs
    // to the tea rather than to a пролив. The descriptors themselves are
    // ordinary Aroma documents carrying brewingCount 0 — same dictionary, same
    // pickers, same quick-pick statistics as every other aroma; only this
    // free-text characterisation lives on the tasting.
    dryAromaDescription: {
      type: String,
      required: false,
      maxlength: 2000,
    },

    // Moderation. Deliberately NOT the same field as publicAccess: that one is
    // the owner's own switch, so a block expressed through it would be undone by
    // the next tap on «Публикация в блоге». While this is true the tasting is
    // out of the feed and the owner cannot put it back — only an admin can.
    blocked: {
      type: Boolean,
      default: false,
    },
    blockedAt: {
      type: Date,
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    averageRating: {
      type: Number,
      required: false,
      min: 0,
      max: 10,
    },

    // Up to three labelled shots of the tasting: dry leaf, liquor, wet leaf.
    // _id: false keeps the subdocuments as plain {url, kind} pairs — the edit
    // dialog sends them straight back and the Joi body schema rejects extras.
    // Note findOneAndUpdate/updateMany skip validators, so the enum here is
    // documentation; the celebrate schema in routes/teaforms.js is the gate.
    photos: [
      {
        url: { type: String, required: true },
        kind: { type: String, enum: ["dry", "liquor", "wet"], required: true },
        // 320px WebP for the feed, written at upload time. Optional: photos
        // uploaded before it existed have none, and the card falls back to the
        // full-size original for those.
        thumb: { type: String },
        _id: false,
      },
    ],

    // Spoken notes: one short recording per пролив (brewingNumber 1..N) plus an
    // optional general one (0), merged server-side into a single track that is
    // what gets played back and sent for recognition.
    //
    // They live here rather than on the Brewing documents because a note
    // recorded during stage 2 has no brewing _id yet — brewings are only created
    // when the wizard submits — and because the merged track and the transcript
    // are properties of the tasting as a whole.
    //
    // track/transcript/status/operationId/error are written by the background
    // job, never by the client: patchTeaForm drops them from an incoming body so
    // an edit dialog opened before recognition finished cannot save over the
    // transcript that arrived while it was open.
    voice: {
      segments: [
        {
          url: { type: String, required: true },
          brewingNumber: { type: Number, default: 0 },
          duration: { type: Number, default: 0 },
          _id: false,
        },
      ],
      track: {
        url: { type: String },
        duration: { type: Number },
      },
      transcript: { type: String },
      // The same speech before text normalization rewrote it. Normalization
      // is what makes the stored transcript readable, but it also converts
      // spoken numbers — «пять с половиной грамм» came back as «5 15 Грамм»
      // and was stored as a 15 g dose. So the extraction reads this one and
      // the reader sees the other. Both come from a single recognition.
      transcriptRaw: { type: String },

      // One entry per пролив that was actually recorded against, in пролив
      // order. `brewingNumber` here is the user's own: they tapped record
      // inside that пролив's block. Recognition runs once per пролив so the
      // boundary survives into the transcript, instead of being merged away
      // and then guessed at from the words — which silently collapsed several
      // проливы into one and left the rest with no suggestion at all.
      //
      // `transcript` above stays the flat, readable join of these, for the
      // player and for records recognised before this existed.
      parts: [
        {
          brewingNumber: { type: Number, default: 0 },
          transcript: { type: String },
          transcriptRaw: { type: String },
          _id: false,
        },
      ],

      // Recognition jobs submitted to SpeechKit but not yet collected. Written
      // down between submitting and polling so a restart in that window polls
      // work already paid for rather than buying it again.
      pending: [
        {
          brewingNumber: { type: Number, default: 0 },
          operationId: { type: String },
          _id: false,
        },
      ],
      // A recording captures whatever else was in the room — other people, the
      // kitchen, the kids. So sharing the audio is a separate, explicit decision
      // from publishing the tasting text, and it defaults to off.
      public: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ["idle", "queued", "processing", "done", "error"],
        default: "idle",
      },
      operationId: { type: String },
      error: { type: String },
      // The YandexGPT result, kept so the same transcript is never billed twice.
      // Mixed because it mirrors the extraction schema, which is free to grow
      // without a migration here. Cleared whenever the transcript changes.
      extraction: { type: mongoose.Schema.Types.Mixed },
      extractedAt: { type: Date },
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
    },
    // Readable public address: /blog/da-hun-pao-ba5e1be584. Derived from nameRU
    // and a hash of the sessionId (utils/slugify.js), regenerated when the tea
    // is renamed. Not required: documents written before this field existed are
    // backfilled by utils/migrateSlugs.js, and until then they resolve by
    // sessionId, which stays the permanent fallback.
    slug: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

userSchema.index({ owner: 1, sessionId: 1 });
userSchema.index({ publicAccess: 1, createdAt: -1 });
// Sparse: pre-migration documents have no slug at all, and a plain unique index
// would treat every one of their missing values as the same null and reject all
// but the first.
userSchema.index({ slug: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("teaform", userSchema);
