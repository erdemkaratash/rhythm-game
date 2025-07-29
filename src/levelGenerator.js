// levelGenerator.js

/**
 * Generate a taiko-style level from an AudioBuffer.
 * This algorithm employs enhanced onset detection, simplified tempo estimation,
 * and rhythmic quantization to produce more accurate and satisfying note patterns.
 *
 * @param {AudioBuffer} audioBuffer - The audio data to analyze.
 * @param {'easy'|'medium'|'hard'} difficulty - The desired difficulty level.
 * @returns {Array<{time: number, key: string}>} An array of note objects, each with a time and assigned key.
 */
export function generateLevel(audioBuffer, difficulty = 'medium') {
    const raw = audioBuffer.getChannelData(0); // Get audio data from the first channel
    const sr = audioBuffer.sampleRate; // Get the sample rate of the audio

    // --- Configuration Parameters (These can be tuned for different results) ---
    const winSize = 1024; // Window size for RMS/ODF calculation in samples (e.g., 1024 samples = ~23ms at 44.1kHz)
    const hop = winSize / 2; // Hop size in samples (overlap for smoother analysis)

    // Minimum time separation between notes in seconds, adjusted by difficulty
    const minNoteSeparation = {
        'easy': 0.3,   // Notes are spaced out, allowing more reaction time
        'medium': 0.15, // Moderate spacing
        'hard': 0.08    // Notes can be very close, requiring fast reactions
    }[difficulty];

    // Onset Detection Function (ODF) sensitivity: Multiplier for the dynamic ODF threshold.
    // Higher values make the detector less sensitive (fewer onsets), lower values more sensitive (more onsets).
    const odfSensitivity = {
        'easy': 0.5, // Less sensitive, picks up only very strong onsets
        'medium': 0.8, // Moderately sensitive
        'hard': 1.2  // More sensitive, picks up subtle onsets
    }[difficulty];
    const odfSmoothWindow = 3; // Window size for smoothing the ODF (in ODF samples)

    // Tempo Estimation Parameters: Defines the acceptable range for estimated BPM
    const minBPM = 60;
    const maxBPM = 200;
    const ioiHistogramBins = 50; // Number of bins for the Inter-Onset Interval (IOI) histogram

    // Quantization Grid: Rhythmic subdivisions (as fractions of a beat) to snap notes to.
    // 1 = quarter note, 0.5 = eighth note, 0.25 = sixteenth note, 0.125 = thirty-second note
    const quantizationGrid = {
        'easy': [1, 0.5],             // Notes primarily on quarter and eighth notes
        'medium': [1, 0.5, 0.25],     // Includes sixteenth notes for more complexity
        'hard': [1, 0.5, 0.25, 0.125] // Includes thirty-second notes for maximum detail
    }[difficulty];

    // Key Assignment Parameter: Percentile of RMS amplitude to classify a note as 'strong'.
    // Notes above this threshold will be assigned 'ArrowUp'/'ArrowDown', others 'ArrowLeft'/'ArrowRight'.
    const strongNoteThreshold = 0.6; // Top 60% of RMS values are considered 'strong'

    // --- Step 1: Calculate RMS Energy Envelope ---
    // This provides a measure of the overall loudness of the audio over time.
    const rms = [];
    for (let i = 0; i + winSize <= raw.length; i += hop) {
        let sum = 0;
        for (let j = 0; j < winSize; j++) {
            sum += raw[i + j] ** 2; // Sum of squared samples
        }
        rms.push(Math.sqrt(sum / winSize)); // Root Mean Square
    }

    // --- Step 2: Calculate Onset Detection Function (ODF) ---
    // Using the first-order difference of the RMS envelope as a proxy for spectral flux.
    // Positive differences indicate a sudden increase in energy, which often corresponds to an onset.
    const odf = [0]; // Initialize with 0 for the first frame
    for (let i = 1; i < rms.length; i++) {
        odf.push(Math.max(0, rms[i] - rms[i - 1])); // Only consider positive changes
    }

    // Smooth the ODF to reduce noise and emphasize prominent onsets.
    const smoothedOdf = [];
    for (let i = 0; i < odf.length; i++) {
        let sum = 0;
        let count = 0;
        // Apply a simple moving average filter
        for (let j = -Math.floor(odfSmoothWindow / 2); j <= Math.ceil(odfSmoothWindow / 2); j++) {
            if (odf[i + j] !== undefined) { // Check bounds
                sum += odf[i + j];
                count++;
            }
        }
        smoothedOdf.push(sum / count);
    }

    // --- Step 3: Dynamic Peak Picking on ODF ---
    // Identify local maxima in the smoothed ODF that are above a dynamic threshold.
    const detectedOnsets = [];
    // Filter out zero or negative ODF values for threshold calculation to avoid skewing the mean.
    const odfValuesForThreshold = smoothedOdf.filter(v => v > 0);
    const meanOdf = odfValuesForThreshold.length > 0 ?
        odfValuesForThreshold.reduce((a, b) => a + b, 0) / odfValuesForThreshold.length : 0;
    const stdOdf = odfValuesForThreshold.length > 0 ?
        Math.sqrt(odfValuesForThreshold.reduce((a, b) => a + (b - meanOdf) ** 2, 0) / odfValuesForThreshold.length) : 0;

    // The dynamic threshold adapts to the overall energy level of the ODF.
    const dynamicThreshold = meanOdf + stdOdf * odfSensitivity;

    for (let i = 1; i < smoothedOdf.length - 1; i++) {
        // Check if the current point is a local maximum AND exceeds the dynamic threshold.
        if (smoothedOdf[i] > dynamicThreshold &&
            smoothedOdf[i] > smoothedOdf[i - 1] &&
            smoothedOdf[i] > smoothedOdf[i + 1]) {
            detectedOnsets.push({
                time: (i * hop) / sr, // Convert frame index to time in seconds
                originalRms: rms[i], // Store original RMS for later key assignment
                odfValue: smoothedOdf[i] // Store ODF value for potential tie-breaking
            });
        }
    }

    // Ensure that very early, strong onsets are not missed, even if they don't form a sharp peak.
    const firstStrongOdfIdx = smoothedOdf.findIndex(v => v > meanOdf + stdOdf * 0.1);
    if (firstStrongOdfIdx >= 0 && (detectedOnsets.length === 0 || detectedOnsets[0].time > (firstStrongOdfIdx * hop) / sr + 0.1)) {
        // Add it to the beginning if it's a strong onset and either no onsets were found yet,
        // or the first detected onset is significantly later.
        detectedOnsets.unshift({
            time: (firstStrongOdfIdx * hop) / sr,
            originalRms: rms[firstStrongOdfIdx],
            odfValue: smoothedOdf[firstStrongOdfIdx]
        });
    }

    // Sort detected onsets by time to ensure chronological order.
    detectedOnsets.sort((a, b) => a.time - b.time);

    // --- Step 4: Tempo Estimation (Simplified Beat Tracking) ---
    // Calculate Inter-Onset Intervals (IOIs) to find recurring rhythmic patterns.
    const iois = [];
    for (let i = 1; i < detectedOnsets.length; i++) {
        iois.push(detectedOnsets[i].time - detectedOnsets[i - 1].time);
    }

    // Build a histogram of IOIs to identify the most frequent interval, which suggests the beat.
    let dominantIoi = 0;
    if (iois.length > 0) {
        const minIoi = Math.min(...iois);
        const maxIoi = Math.max(...iois);
        const binWidth = (maxIoi - minIoi) / ioiHistogramBins;
        const ioiHistogram = new Array(ioiHistogramBins).fill(0);

        iois.forEach(ioi => {
            if (ioi >= minIoi && ioi <= maxIoi && binWidth > 0) {
                const binIdx = Math.floor((ioi - minIoi) / binWidth);
                ioiHistogram[binIdx]++;
            }
        });

        let maxCount = 0;
        let maxBinIdx = -1;
        for (let i = 0; i < ioiHistogram.length; i++) {
            if (ioiHistogram[i] > maxCount) {
                maxCount = ioiHistogram[i];
                maxBinIdx = i;
            }
        }

        if (maxBinIdx !== -1) {
            // Estimate the dominant IOI from the center of the most populated bin.
            dominantIoi = minIoi + (maxBinIdx + 0.5) * binWidth;
        }
    }

    // Adjust the dominant IOI to fit within a reasonable BPM range (e.g., 60-200 BPM).
    // This helps to normalize the tempo estimation even if the raw IOI is an octave off.
    let estimatedBeatDuration = dominantIoi;
    // If the estimated beat is too slow, divide by 2 until it's within range or too small.
    if (estimatedBeatDuration > 60 / minBPM) {
        while (estimatedBeatDuration > 60 / minBPM && estimatedBeatDuration > 0.1) {
            estimatedBeatDuration /= 2;
        }
    }
    // If the estimated beat is too fast, multiply by 2 until it's within range or too large.
    else if (estimatedBeatDuration < 60 / maxBPM) {
        while (estimatedBeatDuration < 60 / maxBPM && estimatedBeatDuration < 2) {
            estimatedBeatDuration *= 2;
        }
    }

    // Fallback: If no valid dominant IOI is found, default to 120 BPM (0.5 seconds per beat).
    if (estimatedBeatDuration === 0 || isNaN(estimatedBeatDuration) || estimatedBeatDuration < 0.1 || estimatedBeatDuration > 2) {
        estimatedBeatDuration = 0.5;
    }

    // --- Step 5: Rhythmic Quantization ---
    // Snap each detected onset to the nearest point on the rhythmic grid defined by the estimated beat and difficulty.
    const quantizedNotes = [];
    // Use the time of the first detected onset as the starting point for the rhythmic grid.
    const startTime = detectedOnsets.length > 0 ? detectedOnsets[0].time : 0;

    detectedOnsets.forEach(onset => {
        let bestQuantizedTime = onset.time;
        let minTimeDiff = Infinity;

        quantizationGrid.forEach(subdivision => {
            const beatUnit = estimatedBeatDuration * subdivision;
            if (beatUnit === 0) return; // Avoid division by zero

            // Calculate how many beat units away the onset is from the start time.
            const numBeatUnits = (onset.time - startTime) / beatUnit;
            // Find the nearest grid point by rounding to the nearest whole beat unit.
            const nearestGridPoint = Math.round(numBeatUnits) * beatUnit + startTime;

            const timeDiff = Math.abs(onset.time - nearestGridPoint);

            // If this grid point is closer than previous ones, update the best quantized time.
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                bestQuantizedTime = nearestGridPoint;
            }
        });
        quantizedNotes.push({
            time: Math.max(0, bestQuantizedTime), // Ensure time is not negative
            originalRms: onset.originalRms,
            odfValue: onset.odfValue
        });
    });

    // --- Step 6: Note Type (Key) Assignment ---
    // Assign keys ('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight') based on the original RMS amplitude.
    // This creates a distinction between 'strong' (Don) and 'weak' (Kat) notes, and alternates hands.
    const finalNotes = [];
    const allRmsValues = quantizedNotes.map(n => n.originalRms);
    allRmsValues.sort((a, b) => a - b); // Sort RMS values to find the percentile threshold.
    // Determine the RMS value that separates 'strong' from 'weak' notes.
    const strongRmsThreshold = allRmsValues[Math.floor(allRmsValues.length * strongNoteThreshold)] || 0;

    let lastStrongKey = 'ArrowUp'; // Tracks the last assigned strong note key for alternation
    let lastWeakKey = 'ArrowLeft'; // Tracks the last assigned weak note key for alternation

    quantizedNotes.forEach(note => {
        let key;
        if (note.originalRms >= strongRmsThreshold) {
            // If it's a strong note, alternate between 'ArrowUp' and 'ArrowDown'.
            key = lastStrongKey === 'ArrowUp' ? 'ArrowDown' : 'ArrowUp';
            lastStrongKey = key;
        } else {
            // If it's a weak note, alternate between 'ArrowLeft' and 'ArrowRight'.
            key = lastWeakKey === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
            lastWeakKey = key;
        }
        finalNotes.push({ time: note.time, key });
    });

    // --- Step 7: Difficulty Filtering and Post-processing ---
    // Remove any duplicate notes that might have resulted from quantization snapping multiple onsets to the same time.
    const uniqueNotesMap = new Map();
    finalNotes.forEach(note => {
        // Use a rounded time as a key to group notes that are very close (e.g., within 1ms).
        const timeKey = Math.round(note.time * 1000);
        if (!uniqueNotesMap.has(timeKey)) {
            uniqueNotesMap.set(timeKey, note);
        } else {
            // If a duplicate exists, prefer the note that originated from a stronger onset (higher ODF value).
            const existingNote = uniqueNotesMap.get(timeKey);
            const originalNoteForExisting = quantizedNotes.find(qn => Math.round(qn.time * 1000) === timeKey && qn.time === existingNote.time);
            const originalNoteForCurrent = quantizedNotes.find(qn => Math.round(qn.time * 1000) === timeKey && qn.time === note.time);

            if (originalNoteForCurrent && originalNoteForExisting && originalNoteForCurrent.odfValue > originalNoteForExisting.odfValue) {
                 uniqueNotesMap.set(timeKey, note);
            }
        }
    });

    // Convert the map back to an array and sort by time.
    let filteredNotes = Array.from(uniqueNotesMap.values()).sort((a, b) => a.time - b.time);

    // Apply the minimum note separation to ensure playability, especially for lower difficulties.
    const processedNotes = [];
    if (filteredNotes.length > 0) {
        processedNotes.push(filteredNotes[0]); // Always include the first note
        for (let i = 1; i < filteredNotes.length; i++) {
            // Only add the current note if it's sufficiently separated from the previously added note.
            if (filteredNotes[i].time - processedNotes[processedNotes.length - 1].time >= minNoteSeparation) {
                processedNotes.push(filteredNotes[i]);
            }
        }
    }

    return processedNotes;
}
