// app/api/qa-report/route.ts
// Generates a QA report JSON via Claude then renders a PDF via Python script.
// Returns: { report, pdfBase64 }
// pdfBase64 attaches directly to the delivery email via Resend.
//
// POST body:
// { orderId, bookTitle, authorName, targetLanguage, targetLanguageCode,
//   genre, originalText (first 8000 chars), translatedText (first 8000 chars), wordCount }

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German", it: "Italian", fr: "French",
  "es-es": "Spanish (Spain)", "es-latam": "Spanish (Latin America)",
  pt: "Portuguese", "pt-pt": "Portuguese (Portugal)",
  "pt-br": "Portuguese (Brazil)", nl: "Dutch", pl: "Polish", ja: "Japanese",
};

const SCORING_RUBRIC = `
Scoring rubric — follow exactly, scores MUST reflect this:
9-10: Exceptional. Reserve for something genuinely notable. A 10 means it is
      hard to imagine doing better.
8:    Solid, publication-ready, above average for AI translation.
7:    Good, works well, one or two things worth noting.
6:    Acceptable but the author should know about a specific limitation.
5 or below: Something went meaningfully wrong — name it.
Do NOT give everything 9 or 10. Most good translations score 7-8.
A score of 6 is honest, not a failure. Calibrate carefully.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      orderId, bookTitle, authorName, targetLanguage: tl,
      targetLanguageCode, genre, originalText, translatedText, wordCount,
    } = body;

    if (!bookTitle || !originalText || !translatedText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const langName = tl || LANGUAGE_NAMES[targetLanguageCode] || targetLanguageCode;

    const prompt = `You are a senior literary translator and publishing consultant producing a quality assurance report for ${authorName || "the author"}, an English speaker whose book "${bookTitle}" has just been translated into ${langName} by BookLingua.

This report must give the author genuine confidence backed by specifics from their actual book. Every section must reference their book by name, mention real details from the text, and be something they could not have received for a different book.

${SCORING_RUBRIC}

BOOK DETAILS:
Title: ${bookTitle}
Author: ${authorName || "the author"}
Target language: ${langName}
Genre: ${genre || "General non-fiction"}
Word count: ${wordCount ? wordCount.toLocaleString() : "not specified"}

ENGLISH ORIGINAL (opening excerpt):
${originalText.slice(0, 8000)}

${langName.toUpperCase()} TRANSLATION (opening excerpt):
${translatedText.slice(0, 8000)}

Return ONLY valid JSON with this exact structure. No preamble, no markdown fences:

{
  "verdict": "One or two sentences. The single most important thing to know about this translation. Specific, honest, direct. Not marketing language.",
  "summary": {
    "oneliner": "One sentence describing this book for a ${langName}-speaking reader. Write it in ${langName}.",
    "overview": "2-3 sentences on what the book argues, teaches, or tells. Specific to this book.",
    "audience": "Who the ${langName} reader is and why this book will resonate with them."
  },
  "characters": [
    {
      "name": "Person name",
      "role": "Their role: protagonist, case study, expert, narrator, etc.",
      "note": "One sentence on how they appear in the ${langName} translation."
    }
  ],
  "translationApproach": {
    "voiceAndRegister": "How the translator handled the author's voice in ${langName}. Name the register and why it fits the genre. Be specific.",
    "culturalAdaptations": "Idioms, references, or cultural touchpoints adapted for ${langName} readers. If none, say so.",
    "whatWasKept": "What was preserved verbatim: names, terms, structural devices, formatting.",
    "editorialImprovements": "What the editorial pass improved, with one concrete example from the actual text."
  },
  "scores": {
    "voicePreservation": { "score": 0, "label": "Voice Preservation", "rationale": "One specific sentence explaining the score. Reference the book." },
    "fluencyAndReadability": { "score": 0, "label": "Fluency & Readability", "rationale": "One specific sentence." },
    "culturalAdaptation": { "score": 0, "label": "Cultural Adaptation", "rationale": "One specific sentence." },
    "structuralIntegrity": { "score": 0, "label": "Structural Integrity", "rationale": "One specific sentence." }
  },
  "comparableTitles": [
    {
      "title": "Real published title in ${langName}",
      "author": "Author name",
      "note": "One sentence on why your translation sits in similar territory."
    }
  ],
  "readabilityNote": "Plain-language statement of how accessible the ${langName} reads. Reference sentence length and vocabulary for the genre.",
  "oneThing": "The single most important thing the author should know — a section needing heavy adaptation, a judgement call, something to be aware of. Honest and specific. If everything is genuinely fine, say so briefly.",
  "recommendationForAuthor": "2-3 sentences to ${authorName || "the author"} directly. What they have, what to expect from ${langName}-speaking readers. Warm, specific, not generic."
}

Rules: all scores integers, follow the rubric, most good translations score 7-8.
comparableTitles: 2-3 real published books in ${langName} same genre, do not invent.
characters: 2-4 for non-fiction, 3-5 for fiction, empty array if none.
Every field must be filled. Return valid JSON only.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }

    const data = await response.json();
    const raw = data.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let report: Record<string, unknown>;
    try {
      report = JSON.parse(clean);
    } catch {
      return NextResponse.json({ error: "Report generation produced invalid JSON", raw }, { status: 500 });
    }

    report.meta = {
      orderId, bookTitle, authorName, targetLanguage: langName,
      targetLanguageCode, genre, wordCount,
      generatedAt: new Date().toISOString(),
    };

    // Render PDF via Python script
    const tmpId = `qa-${orderId || Date.now()}`;
    const jsonPath = join(tmpdir(), `${tmpId}.json`);
    const pdfPath  = join(tmpdir(), `${tmpId}.pdf`);

    await writeFile(jsonPath, JSON.stringify(report));

    try {
      await execAsync(`python3 "${process.cwd()}/scripts/generate-qa-pdf.py" "${jsonPath}" "${pdfPath}"`);
      const pdfBuffer = await readFile(pdfPath);
      const pdfBase64 = pdfBuffer.toString("base64");
      await Promise.allSettled([unlink(jsonPath), unlink(pdfPath)]);
      return NextResponse.json({ report, pdfBase64 }, { status: 200 });
    } catch (pdfErr) {
      console.error("PDF generation error:", pdfErr);
      await Promise.allSettled([unlink(jsonPath)]);
      // Return report JSON even if PDF fails — don't block delivery
      return NextResponse.json({ report, pdfBase64: null, pdfError: "PDF generation failed" }, { status: 200 });
    }

  } catch (err) {
    console.error("qa-report error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
