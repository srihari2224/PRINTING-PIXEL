const mongoose = require("mongoose")

const printJobSchema = new mongoose.Schema({
  uploadId:    { type: String, required: true },
  kioskId:     { type: String, required: true, index: true },

  files: [{
    url:          String,       // S3 presigned URL (generated at job creation)
    s3Key:        String,       // raw S3 key for re-signing if needed
    originalName: String,
    pageCount:    Number,
    printOptions: {
      copies:    { type: Number, default: 1 },
      colorMode: { type: String, enum: ["color", "bw"], default: "color" },
      duplex:    { type: String, enum: ["single", "double"], default: "single" },
      pageRange: { type: String, default: "all" }
    }
  }],

  totalPages: { type: Number, default: 0 },

  status: {
    type: String,
    enum: [
      "QUEUED",           // created, waiting for agent to pick up
      "SENT_TO_AGENT",    // emitted via Socket.IO, agent acknowledged
      "DOWNLOADING",      // agent is downloading files
      "PROCESSING",       // agent is normalizing PDFs
      "PRINTING",         // agent is printing
      "COMPLETED",        // all files printed successfully
      "PARTIAL_FAILURE",  // some files failed
      "FAILED",           // all files failed or agent error
      "AGENT_OFFLINE"     // agent was not connected when job was created
    ],
    default: "QUEUED"
  },

  // Per-file results (populated by agent after printing)
  results: [{
    filename: String,
    success:  Boolean,
    error:    String
  }],

  // Per-printer live progress (populated by agent during printing, polled by frontend)
  printerProgress: [{
    printer:     { type: String },    // "printer1" | "printer2"
    printerName: { type: String },    // human-readable OS printer name
    status: {
      type: String,
      enum: ["QUEUED", "DOWNLOADING", "PROCESSING", "PRINTING", "COMPLETED", "FAILED"],
      default: "QUEUED"
    },
    filesDone:   { type: Number, default: 0 },
    filesTotal:  { type: Number, default: 0 },
    currentFile: { type: String },    // filename currently being processed
    error:       { type: String }     // CUPS/lp error string if failed
  }],

  // Human-readable failure reason (set by agent on FAILED/PARTIAL_FAILURE)
  failureReason: { type: String },

  // Timestamps
  agentReceivedAt: Date,
  completedAt:     Date,
  error:           String,

  createdAt: { type: Date, default: Date.now }
})

// Index for polling by job ID
printJobSchema.index({ _id: 1, status: 1 })
// Index for listing recent jobs per kiosk
printJobSchema.index({ kioskId: 1, createdAt: -1 })

module.exports = mongoose.model("PrintJob", printJobSchema)
