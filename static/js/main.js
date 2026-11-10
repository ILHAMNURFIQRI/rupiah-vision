document.addEventListener("DOMContentLoaded", () => {
  const webcam = document.getElementById("webcam");
  const overlay = document.getElementById("overlay");
  const context = overlay.getContext("2d");
  const cameraSelect = document.getElementById("cameraSelect");
  const totalAmount = document.getElementById("totalAmount");
  const detectedCount = document.getElementById("detectedCount");
  const detectionList = document.getElementById("detectionList");
  const listCount = document.getElementById("listCount");
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const cameraPlaceholder = document.getElementById("cameraPlaceholder");

  const rupiahFormatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });

  let stream = null;
  let isProcessing = false;
  let cameraRequest = 0;
  let animationFrame = null;

  function setStatus(message, state) {
    statusText.textContent = message;
    statusBadge.dataset.state = state;
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    webcam.srcObject = null;
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  async function getCameras() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Kamera tidak didukung", "error");
      cameraPlaceholder.querySelector("strong").textContent = "Browser tidak mendukung kamera";
      cameraPlaceholder.querySelector("span:last-child").textContent =
        "Buka aplikasi melalui localhost dengan browser yang mendukung WebRTC.";
      return;
    }

    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
      permissionStream.getTracks().forEach((track) => track.stop());
      await refreshCameraList();
      if (!cameraSelect.value) {
        await startWebcam();
      }
    } catch (error) {
      console.error("Gagal mendapatkan akses kamera:", error);
      showCameraError(error);
    }
  }

  async function refreshCameraList() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    const previousDeviceId = cameraSelect.value;

    cameraSelect.replaceChildren();
    videoDevices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Kamera ${index + 1}`;
      cameraSelect.append(option);
    });

    cameraSelect.disabled = videoDevices.length === 0;
    if (videoDevices.length === 0) {
      cameraSelect.add(new Option("Kamera tidak ditemukan", ""));
      setStatus("Kamera tidak ditemukan", "error");
      return;
    }

    if (videoDevices.some((device) => device.deviceId === previousDeviceId)) {
      cameraSelect.value = previousDeviceId;
    }
  }

  function showCameraError(error) {
    setStatus("Akses kamera gagal", "error");
    cameraPlaceholder.hidden = false;
    const title = cameraPlaceholder.querySelector("strong");
    const description = cameraPlaceholder.querySelector("span:last-child");

    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      title.textContent = "Izin kamera diperlukan";
      description.textContent = "Izinkan akses kamera di pengaturan browser, lalu muat ulang halaman.";
    } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      title.textContent = "Kamera tidak ditemukan";
      description.textContent = "Hubungkan webcam, lalu muat ulang halaman.";
    } else {
      title.textContent = "Kamera tidak dapat dibuka";
      description.textContent = error.message || "Periksa koneksi kamera dan coba lagi.";
    }
  }

  async function startWebcam(deviceId = cameraSelect.value) {
    const requestId = ++cameraRequest;
    stopStream();
    setStatus("Menghubungkan kamera", "idle");
    cameraPlaceholder.hidden = false;

    const video = {
      width: { ideal: 640 },
      height: { ideal: 480 },
    };
    if (deviceId) {
      video.deviceId = { exact: deviceId };
    }

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      if (requestId !== cameraRequest) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }

      stream = nextStream;
      webcam.srcObject = stream;
      await webcam.play();
      overlay.width = webcam.videoWidth;
      overlay.height = webcam.videoHeight;
      cameraPlaceholder.hidden = true;
      setStatus("Kamera aktif · deteksi langsung", "live");
      await refreshCameraList();
      scheduleFrame();
    } catch (error) {
      if (requestId === cameraRequest) {
        console.error("Gagal mengakses webcam:", error);
        showCameraError(error);
      }
    }
  }

  function scheduleFrame() {
    if (stream && !isProcessing) {
      animationFrame = window.setTimeout(processFrame, 100);
    }
  }

  async function processFrame() {
    animationFrame = null;
    if (!stream || webcam.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || isProcessing) {
      scheduleFrame();
      return;
    }

    isProcessing = true;
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = webcam.videoWidth;
    captureCanvas.height = webcam.videoHeight;
    captureCanvas.getContext("2d").drawImage(webcam, 0, 0, captureCanvas.width, captureCanvas.height);

    try {
      const imageBlob = await new Promise((resolve) => captureCanvas.toBlob(resolve, "image/jpeg", 0.7));
      if (!imageBlob) {
        throw new Error("Browser gagal menyiapkan gambar dari kamera.");
      }

      const formData = new FormData();
      formData.append("file", imageBlob, "frame.jpg");
      const response = await fetch("/detect", { method: "POST", body: formData });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Server gagal memproses gambar.");
      }
      updateUI(data);
    } catch (error) {
      console.error("Gagal mengirim frame ke backend:", error);
      setStatus("Deteksi terganggu", "error");
    } finally {
      isProcessing = false;
      if (stream) {
        if (statusBadge.dataset.state === "error") {
          setStatus("Kamera aktif · deteksi langsung", "live");
        }
        scheduleFrame();
      }
    }
  }

  function updateUI(data) {
    const detections = Array.isArray(data.detections) ? data.detections : [];
    context.clearRect(0, 0, overlay.width, overlay.height);
    totalAmount.textContent = rupiahFormatter.format(data.total_amount);
    detectedCount.textContent = String(data.detected_count);
    listCount.textContent = String(data.detected_count);
    detectionList.replaceChildren();

    if (detections.length === 0) {
      const emptyState = document.createElement("li");
      emptyState.className = "empty-state";
      const icon = document.createElement("span");
      icon.className = "empty-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "◎";
      const message = document.createElement("span");
      message.textContent = "Belum ada uang yang terdeteksi";
      emptyState.append(icon, message);
      detectionList.append(emptyState);
      return;
    }

    detections.forEach((item) => {
      drawDetection(item);

      const row = document.createElement("li");
      row.className = "detection-item";
      const details = document.createElement("div");
      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = item.label;
      const nominal = document.createElement("span");
      nominal.className = "item-nominal";
      nominal.textContent = rupiahFormatter.format(item.nominal);
      details.append(label, nominal);

      const confidence = document.createElement("span");
      confidence.className = "confidence";
      confidence.textContent = `${item.confidence}%`;
      row.append(details, confidence);
      detectionList.append(row);
    });
  }

  function drawDetection(item) {
    if (!Array.isArray(item.box) || item.box.length !== 4) {
      return;
    }
    const [x1, y1, x2, y2] = item.box;
    const width = x2 - x1;
    const height = y2 - y1;
    const label = `${item.label} (${item.confidence}%)`;
    const fontSize = Math.max(12, Math.round(overlay.width / 48));
    context.font = `600 ${fontSize}px "Segoe UI", sans-serif`;
    const textWidth = context.measureText(label).width;
    const labelTop = Math.max(0, y1 - fontSize - 10);

    context.strokeStyle = "#47d6a1";
    context.lineWidth = Math.max(2, overlay.width / 320);
    context.strokeRect(x1, y1, width, height);
    context.fillStyle = "#47d6a1";
    context.fillRect(x1, labelTop, textWidth + 12, fontSize + 8);
    context.fillStyle = "#10251f";
    context.fillText(label, x1 + 6, labelTop + fontSize + 1);
  }

  cameraSelect.addEventListener("change", () => {
    startWebcam(cameraSelect.value);
  });

  navigator.mediaDevices?.addEventListener?.("devicechange", async () => {
    try {
      await refreshCameraList();
    } catch (error) {
      console.error("Gagal memperbarui daftar kamera:", error);
    }
  });

  window.addEventListener("pagehide", stopStream);
  getCameras();
});
