import io
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model" / "my_model.pt"
MAX_IMAGE_SIZE = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not MODEL_PATH.is_file():
        raise RuntimeError(f"File model tidak ditemukan: {MODEL_PATH}")
    app.state.model = YOLO(str(MODEL_PATH))
    yield


app = FastAPI(title="Mata Uang Vision AI", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


def extract_nominal(label: str) -> int:
    """Ambil nominal pertama yang tertulis pada nama kelas model."""
    numbers = re.findall(r"\d+", label)
    return int(numbers[0]) if numbers else 0


@app.get("/", response_class=HTMLResponse)
async def serve_ui(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.post("/detect")
async def detect_currency(request: Request, file: UploadFile = File(...)):
    image_bytes = await file.read(MAX_IMAGE_SIZE + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="File gambar kosong.")
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Ukuran gambar maksimal 10 MB.")

    try:
        with Image.open(io.BytesIO(image_bytes)) as uploaded_image:
            image = uploaded_image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise HTTPException(status_code=400, detail="File yang dikirim bukan gambar yang valid.") from error

    results = request.app.state.model.predict(
        source=image,
        conf=0.5,
        imgsz=640,
        verbose=False,
    )

    detections = []
    total_amount = 0
    for result in results:
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            class_name = str(result.names[class_id])
            nominal = extract_nominal(class_name)
            total_amount += nominal
            detections.append(
                {
                    "box": [round(float(value), 2) for value in box.xyxy[0].tolist()],
                    "label": class_name,
                    "confidence": round(float(box.conf[0].item()) * 100, 1),
                    "nominal": nominal,
                }
            )

    return JSONResponse(
        content={
            "status": "success",
            "total_amount": total_amount,
            "detected_count": len(detections),
            "detections": detections,
        }
    )
