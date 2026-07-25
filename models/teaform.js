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
      status: {
        type: String,
        enum: ["idle", "queued", "processing", "done", "error"],
        default: "idle",
      },
      operationId: { type: String },
      error: { type: String },
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
  },
  { timestamps: true }
);

userSchema.index({ owner: 1, sessionId: 1 });
userSchema.index({ publicAccess: 1, createdAt: -1 });

module.exports = mongoose.model("teaform", userSchema);
