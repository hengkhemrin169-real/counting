
"use strict";

// ==========================================
// KHEMRIN - AI PEOPLE COUNTER
// Desktop / Android / iPhone
// ==========================================

// CAMERA SETTINGS

let currentFacingMode = "environment";

let model = null;
let modelPromise = null;

let video = null;
let stream = null;

let running = false;
let detecting = false;
let cameraBusy = false;

let animationId = null;
let cameraRequestId = 0;


// ==========================================
// LOAD AI MODEL
// ==========================================

async function loadModel() {

    if (model) return model;

    if (!modelPromise) {

        modelPromise = (async () => {

            if (
                typeof tf === "undefined" ||
                typeof cocoSsd === "undefined"
            ) {
                throw new Error(
                    "AI libraries not loaded. Check internet connection."
                );
            }

            await tf.ready();

            const loadedModel = await cocoSsd.load({
                base: "lite_mobilenet_v2"
            });

            model = loadedModel;

            return model;

        })();

    }

    try {

        return await modelPromise;

    } catch (error) {

        modelPromise = null;

        throw error;

    }
}


// ==========================================
// DRAW PEOPLE DETECTION
// ==========================================

function drawPeople(ctx, predictions, threshold = 0.55) {

    let people = 0;

    predictions.forEach(person => {

        if (
            person.class !== "person" ||
            person.score < threshold
        ) {
            return;
        }

        people++;

        const [x, y, w, h] = person.bbox;

        // Detection box

        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 3;

        ctx.strokeRect(x, y, w, h);

        // Detection label

        const label =
            "Person " +
            Math.round(person.score * 100) +
            "%";

        ctx.font = "bold 15px Arial";

        const labelWidth =
            ctx.measureText(label).width + 12;

        const labelY = Math.max(0, y - 26);

        ctx.fillStyle = "#16a34a";

        ctx.fillRect(
            x,
            labelY,
            labelWidth,
            25
        );

        ctx.fillStyle = "#ffffff";

        ctx.fillText(
            label,
            x + 6,
            labelY + 18
        );

    });

    return people;

}


// ==========================================
// OPEN CAMERA
// ==========================================

async function openCamera() {

    const status =
        document.getElementById("status");

    const requestId = ++cameraRequestId;

    try {

        status.textContent = "កំពុងបើក Camera...";

        if (!navigator.mediaDevices?.getUserMedia) {

            throw new Error(
                "Camera ត្រូវការ HTTPS ឬ localhost។"
            );

        }

        // Request selected camera

        const newStream =
            await navigator.mediaDevices.getUserMedia({

                video: {
                    facingMode: {
                        ideal: currentFacingMode
                    },
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },

                audio: false

            });

        // If camera request was cancelled

        if (requestId !== cameraRequestId) {

            newStream.getTracks().forEach(track => {
                track.stop();
            });

            return;

        }

        stream = newStream;

        video = document.createElement("video");

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;

        video.setAttribute("playsinline", "");
        video.setAttribute("autoplay", "");

        await new Promise((resolve, reject) => {

            video.onloadedmetadata = resolve;

            video.onerror = () => {
                reject(new Error("Cannot load camera video."));
            };

        });

        if (requestId !== cameraRequestId) return;

        await video.play();

        if (requestId !== cameraRequestId) return;

        // Prepare canvas

        const canvas =
            document.getElementById("canvas");

        const scale = Math.min(
            1,
            640 / video.videoWidth,
            640 / video.videoHeight
        );

        canvas.width =
            Math.round(video.videoWidth * scale);

        canvas.height =
            Math.round(video.videoHeight * scale);

        status.textContent = "កំពុង Load AI Model...";

        await loadModel();

        if (requestId !== cameraRequestId) return;

        running = true;

        status.textContent =
            currentFacingMode === "environment"
                ? "Camera ក្រោយ - AI កំពុងរាប់មនុស្ស"
                : "Camera មុខ - AI កំពុងរាប់មនុស្ស";

        detectPeople(requestId);

    } catch (error) {

        console.error("Camera error:", error);

        if (requestId === cameraRequestId) {

            status.textContent =
                "មានបញ្ហា: " + error.message;

            stopCamera();

        }

        throw error;

    }

}


// ==========================================
// START CAMERA
// ==========================================

async function startCamera() {

    if (running || cameraBusy) return;

    cameraBusy = true;

    const startBtn =
        document.getElementById("startBtn");

    startBtn.disabled = true;

    try {

        await openCamera();

    } catch (error) {

        console.error(error);

    } finally {

        cameraBusy = false;

        startBtn.disabled = false;

    }

}


// ==========================================
// SWITCH FRONT / BACK CAMERA
// ==========================================

async function switchCamera() {

    if (cameraBusy) return;

    cameraBusy = true;

    const switchBtn =
        document.getElementById("switchBtn");

    const status =
        document.getElementById("status");

    switchBtn.disabled = true;

    const wasRunning = running;

    try {

        // Stop old camera

        if (wasRunning) {
            stopCamera();
        }

        // Change camera

        currentFacingMode =
            currentFacingMode === "environment"
                ? "user"
                : "environment";

        if (wasRunning) {

            status.textContent = "កំពុងប្ដូរ Camera...";

            await openCamera();

        } else {

            status.textContent =
                currentFacingMode === "environment"
                    ? "បានជ្រើសរើស Camera ក្រោយ"
                    : "បានជ្រើសរើស Camera មុខ";

        }

    } catch (error) {

        console.error("Switch camera error:", error);

    } finally {

        cameraBusy = false;

        switchBtn.disabled = false;

    }

}


// ==========================================
// LIVE AI DETECTION
// ==========================================

async function detectPeople(requestId) {

    if (
        !running ||
        detecting ||
        !video ||
        !model
    ) return;

    detecting = true;

    try {

        const canvas =
            document.getElementById("canvas");

        const ctx =
            canvas.getContext("2d");

        // Draw video frame

        ctx.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        // AI detection

        const predictions =
            await model.detect(canvas);

        // Ignore old camera session

        if (
            !running ||
            requestId !== cameraRequestId
        ) return;

        const people =
            drawPeople(ctx, predictions);

        document.getElementById("total").textContent =
            people;

    } catch (error) {

        console.error("Detection error:", error);

    } finally {

        detecting = false;

    }

    if (
        running &&
        requestId === cameraRequestId
    ) {

        animationId =
            requestAnimationFrame(() => {
                detectPeople(requestId);
            });

    }

}


// ==========================================
// STOP CAMERA
// ==========================================

function stopCamera() {

    // Cancel current session

    cameraRequestId++;

    running = false;

    if (animationId !== null) {

        cancelAnimationFrame(animationId);

        animationId = null;

    }

    // Stop all camera tracks

    if (stream) {

        stream.getTracks().forEach(track => {
            track.stop();
        });

        stream = null;

    }

    // Remove video

    if (video) {

        video.pause();

        video.srcObject = null;

        video = null;

    }

    detecting = false;

    // Clear canvas

    const canvas =
        document.getElementById("canvas");

    const ctx =
        canvas.getContext("2d");

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    document.getElementById("total").textContent = "0";

    document.getElementById("status").textContent =
        "Camera stopped";

}


// ==========================================
// UPLOAD IMAGE AND COUNT PEOPLE
// ==========================================

async function countImagePeople() {

    const file =
        document.getElementById("imageUpload").files[0];

    const status =
        document.getElementById("imageStatus");

    const result =
        document.getElementById("imageCount");

    const button =
        document.getElementById("countBtn");

    const canvas =
        document.getElementById("imageCanvas");

    const ctx =
        canvas.getContext("2d");

    if (!file) {

        alert("Please select an image first!");

        return;

    }

    if (!file.type.startsWith("image/")) {

        alert("Please select a valid image!");

        return;

    }

    let imageURL = null;

    try {

        button.disabled = true;

        status.textContent = "កំពុង Load រូបភាព...";

        result.textContent = "0";

        const image = new Image();

        imageURL = URL.createObjectURL(file);

        image.src = imageURL;

        await new Promise((resolve, reject) => {

            image.onload = resolve;

            image.onerror = () => {
                reject(new Error("Cannot open this image."));
            };

        });

        // Resize image

        const scale = Math.min(
            1,
            1200 / image.naturalWidth,
            1200 / image.naturalHeight
        );

        canvas.width =
            Math.round(image.naturalWidth * scale);

        canvas.height =
            Math.round(image.naturalHeight * scale);

        // Draw uploaded image

        ctx.drawImage(
            image,
            0,
            0,
            canvas.width,
            canvas.height
        );

        status.textContent = "កំពុង Load AI Model...";

        await loadModel();

        status.textContent = "AI កំពុងរកមនុស្ស...";

        // Detect people

        const predictions =
            await model.detect(canvas);

        const people =
            drawPeople(ctx, predictions);

        result.textContent = people;

        status.textContent =
            "ការរកឃើញមនុស្សបានបញ្ចប់!";

    } catch (error) {

        console.error("Image detection error:", error);

        status.textContent =
            "មានបញ្ហា: " + error.message;

    } finally {

        if (imageURL) {
            URL.revokeObjectURL(imageURL);
        }

        button.disabled = false;

    }

}


// ==========================================
// END OF KHEMRIN
// ==========================================
