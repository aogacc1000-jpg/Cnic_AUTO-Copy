"""
CNIC Copy Maker — Offline Windows Desktop Utility
Converts Front & Back CNIC images into a single arranged A4 PDF.
Dependencies: PySide6, Pillow, reportlab
"""

import os
import sys
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

from PIL import Image, ImageOps
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from PySide6.QtCore import Qt, QPoint, QRect, QSettings, QSize, QStandardPaths, QUrl
from PySide6.QtGui import QDesktopServices, QDragEnterEvent, QDropEvent, QImage, QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QButtonGroup,
    QDialog,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QRadioButton,
    QRubberBand,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

APP_NAME = "CNIC Copy Maker"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

DARK_STYLESHEET = """
QMainWindow, QDialog {
    background-color: #070D19;
    color: #F8FAFC;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 13px;
}
QWidget {
    color: #F8FAFC;
    font-family: "Segoe UI", Arial, sans-serif;
}
QFrame#PanelCard {
    background-color: #0D1629;
    border: 1px solid #1E2E4D;
    border-radius: 8px;
}
QFrame#ControlBar {
    background-color: #0D1629;
    border: 1px solid #1E2E4D;
    border-radius: 8px;
}
QLabel#SectionTitle {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.8px;
    color: #93C5FD;
}
QLabel#MutedText {
    font-size: 12px;
    color: #94A3B8;
}
QLabel#DropPreview {
    background-color: #08101F;
    border: 1px dashed #2A3F66;
    border-radius: 6px;
    color: #94A3B8;
}
QLabel#DropPreview[hasImage="true"] {
    border: 1px solid #254375;
}
QLabel#DropPreview[dragActive="true"] {
    border: 2px dashed #3B82F6;
    background-color: #0F1D36;
}
QPushButton {
    background-color: #13203B;
    color: #F1F5F9;
    border: 1px solid #23375E;
    border-radius: 6px;
    padding: 6px 12px;
    font-weight: 500;
}
QPushButton:hover {
    background-color: #1B2D52;
    border-color: #3B82F6;
}
QPushButton:pressed {
    background-color: #101B33;
}
QPushButton:disabled {
    background-color: #0B1324;
    color: #475569;
    border-color: #16223A;
}
QPushButton#PrimaryButton {
    background-color: #2563EB;
    color: #FFFFFF;
    border: 1px solid #3B82F6;
    border-radius: 6px;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.4px;
}
QPushButton#PrimaryButton:hover {
    background-color: #1D4ED8;
}
QPushButton#PrimaryButton:pressed {
    background-color: #1E40AF;
}
QPushButton#PrimaryButton:disabled {
    background-color: #172544;
    color: #64748B;
    border-color: #1E2E4D;
}
QRadioButton {
    spacing: 6px;
    color: #E2E8F0;
    font-size: 13px;
}
QRadioButton::indicator {
    width: 15px;
    height: 15px;
    border-radius: 8px;
    border: 1px solid #3B82F6;
    background-color: #08101F;
}
QRadioButton::indicator:checked {
    background-color: #2563EB;
    border: 3px solid #08101F;
}
"""


def pil_to_qpixmap(pil_img: Image.Image) -> QPixmap:
    """Convert a Pillow Image safely to QPixmap without ImageQt version issues."""
    rgba = pil_img.convert("RGBA")
    data = rgba.tobytes("raw", "RGBA")
    qimg = QImage(
        data,
        rgba.width,
        rgba.height,
        rgba.width * 4,
        QImage.Format.Format_RGBA8888,
    ).copy()
    return QPixmap.fromImage(qimg)


def get_default_output_folder() -> str:
    docs = QStandardPaths.writableLocation(
        QStandardPaths.StandardLocation.DocumentsLocation
    )
    base = docs if docs else str(Path.home())
    target = Path(base) / "CNIC_Copies"
    return str(target)


class CropLabel(QLabel):
    """Interactive image label supporting rectangular rubber-band crop selection."""

    def __init__(self, pixmap: QPixmap, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._full_pixmap = pixmap
        self._rubber_band = QRubberBand(QRubberBand.Shape.Rectangle, self)
        self._origin = QPoint()
        self._selection = QRect()
        self._image_rect = QRect()

        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setMinimumSize(640, 420)
        self.setCursor(Qt.CursorShape.CrossCursor)
        self.setStyleSheet("background-color: #050A14; border: 1px solid #1E2E4D; border-radius: 6px;")
        self._update_scaled_pixmap()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._update_scaled_pixmap()

    def _update_scaled_pixmap(self):
        if self._full_pixmap.isNull():
            return
        scaled = self._full_pixmap.scaled(
            self.size() - QSize(12, 12),
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation,
        )
        self.setPixmap(scaled)
        x = (self.width() - scaled.width()) // 2
        y = (self.height() - scaled.height()) // 2
        self._image_rect = QRect(x, y, scaled.width(), scaled.height())
        self._selection = QRect()
        self._rubber_band.hide()

    def _clamp_point(self, pt: QPoint) -> QPoint:
        if self._image_rect.isNull():
            return pt
        x = max(self._image_rect.left(), min(pt.x(), self._image_rect.right()))
        y = max(self._image_rect.top(), min(pt.y(), self._image_rect.bottom()))
        return QPoint(x, y)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self._image_rect.contains(event.pos()):
            self._origin = self._clamp_point(event.pos())
            self._selection = QRect(self._origin, QSize())
            self._rubber_band.setGeometry(self._selection)
            self._rubber_band.show()

    def mouseMoveEvent(self, event):
        if not self._origin.isNull() and self._rubber_band.isVisible():
            current = self._clamp_point(event.pos())
            self._selection = QRect(self._origin, current).normalized()
            self._rubber_band.setGeometry(self._selection)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self._rubber_band.isVisible():
            current = self._clamp_point(event.pos())
            self._selection = QRect(self._origin, current).normalized()
            self._rubber_band.setGeometry(self._selection)
            self._origin = QPoint()

    def get_normalized_crop(self) -> Optional[Tuple[float, float, float, float]]:
        """Return (left, top, right, bottom) ratios in [0, 1], or None if too small."""
        if self._selection.isNull() or self._selection.width() < 12 or self._selection.height() < 12:
            return None
        if self._image_rect.width() <= 0 or self._image_rect.height() <= 0:
            return None
        left = (self._selection.left() - self._image_rect.left()) / self._image_rect.width()
        top = (self._selection.top() - self._image_rect.top()) / self._image_rect.height()
        right = (self._selection.right() - self._image_rect.left()) / self._image_rect.width()
        bottom = (self._selection.bottom() - self._image_rect.top()) / self._image_rect.height()
        return (
            max(0.0, min(1.0, left)),
            max(0.0, min(1.0, top)),
            max(0.0, min(1.0, right)),
            max(0.0, min(1.0, bottom)),
        )


class CropDialog(QDialog):
    """Modal dialog for dragging a crop rectangle over an image."""

    def __init__(self, pil_img: Image.Image, title: str, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self.setWindowTitle(f"Crop {title}")
        self.setModal(True)
        self.resize(740, 540)
        self.crop_ratios: Optional[Tuple[float, float, float, float]] = None
        self.reset_requested = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        hint = QLabel("Drag a rectangle across the card edges, then click Apply Crop.")
        hint.setObjectName("MutedText")
        layout.addWidget(hint)

        self.crop_label = CropLabel(pil_to_qpixmap(pil_img), self)
        layout.addWidget(self.crop_label, 1)

        btn_row = QHBoxLayout()
        btn_reset = QPushButton("Reset Crop")
        btn_reset.clicked.connect(self._on_reset)
        btn_row.addWidget(btn_reset)
        btn_row.addStretch()

        btn_cancel = QPushButton("Cancel")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_apply = QPushButton("Apply Crop")
        btn_apply.setObjectName("PrimaryButton")
        btn_apply.clicked.connect(self._on_apply)
        btn_row.addWidget(btn_apply)

        layout.addLayout(btn_row)

    def _on_reset(self):
        self.reset_requested = True
        self.accept()

    def _on_apply(self):
        ratios = self.crop_label.get_normalized_crop()
        if ratios is None:
            QMessageBox.information(
                self,
                "No Selection",
                "Drag a selection box over the image before clicking Apply Crop.",
            )
            return
        self.crop_ratios = ratios
        self.accept()


class ImageSlotPanel(QFrame):
    """Self-contained panel for either FRONT or BACK CNIC image."""

    def __init__(self, slot_title: str, on_change_callback, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self.slot_title = slot_title
        self.on_change_callback = on_change_callback

        self.source_path: Optional[str] = None
        self.base_image: Optional[Image.Image] = None
        self.rotation_deg: int = 0
        self.crop_ratios: Optional[Tuple[float, float, float, float]] = None

        self.setObjectName("PanelCard")
        self.setAcceptDrops(True)

        root = QVBoxLayout(self)
        root.setContentsMargins(14, 12, 14, 14)
        root.setSpacing(10)

        header = QHBoxLayout()
        self.title_label = QLabel(slot_title.upper())
        self.title_label.setObjectName("SectionTitle")
        header.addWidget(self.title_label)

        header.addStretch()
        self.info_label = QLabel("No image selected")
        self.info_label.setObjectName("MutedText")
        header.addWidget(self.info_label)
        root.addLayout(header)

        self.preview_label = QLabel("Drop JPG / PNG here\nor click Upload")
        self.preview_label.setObjectName("DropPreview")
        self.preview_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.preview_label.setMinimumSize(300, 220)
        self.preview_label.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding
        )
        self.preview_label.setProperty("hasImage", False)
        self.preview_label.setProperty("dragActive", False)
        root.addWidget(self.preview_label, 1)

        controls = QHBoxLayout()
        controls.setSpacing(6)

        self.btn_upload = QPushButton("Upload")
        self.btn_upload.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_upload.clicked.connect(self.choose_file)
        controls.addWidget(self.btn_upload)

        self.btn_rot_left = QPushButton("Rotate -90°")
        self.btn_rot_left.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_rot_left.clicked.connect(lambda: self.rotate(-90))
        controls.addWidget(self.btn_rot_left)

        self.btn_rot_right = QPushButton("Rotate +90°")
        self.btn_rot_right.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_rot_right.clicked.connect(lambda: self.rotate(90))
        controls.addWidget(self.btn_rot_right)

        self.btn_crop = QPushButton("Crop")
        self.btn_crop.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_crop.clicked.connect(self.open_crop_dialog)
        controls.addWidget(self.btn_crop)

        self.btn_clear = QPushButton("Clear")
        self.btn_clear.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_clear.clicked.connect(self.clear)
        controls.addWidget(self.btn_clear)

        root.addLayout(controls)
        self._sync_buttons()

    def _sync_buttons(self):
        has_img = self.base_image is not None
        self.btn_rot_left.setEnabled(has_img)
        self.btn_rot_right.setEnabled(has_img)
        self.btn_crop.setEnabled(has_img)
        self.btn_clear.setEnabled(has_img)

    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.mimeData().hasUrls():
            for url in event.mimeData().urls():
                if url.isLocalFile() and Path(url.toLocalFile()).suffix.lower() in SUPPORTED_EXTENSIONS:
                    self._set_drag_active(True)
                    event.acceptProposedAction()
                    return
        event.ignore()

    def dragLeaveEvent(self, event):
        self._set_drag_active(False)
        super().dragLeaveEvent(event)

    def dropEvent(self, event: QDropEvent):
        self._set_drag_active(False)
        for url in event.mimeData().urls():
            if url.isLocalFile():
                path = url.toLocalFile()
                if Path(path).suffix.lower() in SUPPORTED_EXTENSIONS:
                    self.load_image(path)
                    event.acceptProposedAction()
                    return
        event.ignore()

    def _set_drag_active(self, active: bool):
        self.preview_label.setProperty("dragActive", active)
        self.preview_label.style().unpolish(self.preview_label)
        self.preview_label.style().polish(self.preview_label)

    def choose_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            f"Select {self.slot_title} CNIC Image",
            "",
            "Images (*.jpg *.jpeg *.png)",
        )
        if file_path:
            self.load_image(file_path)

    def load_image(self, file_path: str):
        try:
            with Image.open(file_path) as raw:
                oriented = ImageOps.exif_transpose(raw)
                oriented.load()
                if oriented.mode in ("RGBA", "LA", "P"):
                    bg = Image.new("RGB", oriented.size, (255, 255, 255))
                    if oriented.mode == "P":
                        oriented = oriented.convert("RGBA")
                    bg.paste(
                        oriented,
                        mask=oriented.split()[-1] if "A" in oriented.mode else None,
                    )
                    processed = bg
                else:
                    processed = oriented.convert("RGB")
        except Exception as exc:
            QMessageBox.critical(
                self,
                "Invalid Image",
                f"Could not open image:\n{exc}",
            )
            return

        if self.base_image is not None:
            self.base_image.close()

        self.base_image = processed
        self.source_path = file_path
        self.rotation_deg = 0
        self.crop_ratios = None
        self._refresh_preview()
        self._sync_buttons()
        self.on_change_callback()

    def get_processed_image(self) -> Optional[Image.Image]:
        """Return a fresh transformed Pillow image (rotated + cropped) preserving aspect ratio."""
        if self.base_image is None:
            return None
        img = self.base_image
        if self.rotation_deg % 360 != 0:
            # PIL rotate() is counter-clockwise; negate for intuitive clockwise +90°
            img = img.rotate(-self.rotation_deg, expand=True)
        else:
            img = img.copy()

        if self.crop_ratios is not None:
            l_r, t_r, r_r, b_r = self.crop_ratios
            w, h = img.size
            box = (
                int(round(l_r * w)),
                int(round(t_r * h)),
                int(round(r_r * w)),
                int(round(b_r * h)),
            )
            if box[2] - box[0] >= 10 and box[3] - box[1] >= 10:
                cropped = img.crop(box)
                img.close()
                img = cropped
        return img

    def rotate(self, delta_deg: int):
        if self.base_image is None:
            return
        self.rotation_deg = (self.rotation_deg + delta_deg) % 360
        # Clear previous crop ratios on rotation so coordinates stay intuitive
        self.crop_ratios = None
        self._refresh_preview()

    def open_crop_dialog(self):
        if self.base_image is None:
            return
        # Crop against the current rotated (uncropped) image so user can refine freely
        img = (
            self.base_image.rotate(-self.rotation_deg, expand=True)
            if self.rotation_deg % 360 != 0
            else self.base_image.copy()
        )
        try:
            dlg = CropDialog(img, self.slot_title, self)
            if dlg.exec() == QDialog.DialogCode.Accepted:
                if dlg.reset_requested:
                    self.crop_ratios = None
                elif dlg.crop_ratios is not None:
                    self.crop_ratios = dlg.crop_ratios
                self._refresh_preview()
        finally:
            img.close()

    def clear(self):
        if self.base_image is not None:
            self.base_image.close()
        self.base_image = None
        self.source_path = None
        self.rotation_deg = 0
        self.crop_ratios = None
        self.preview_label.setPixmap(QPixmap())
        self.preview_label.setText("Drop JPG / PNG here\nor click Upload")
        self.preview_label.setProperty("hasImage", False)
        self.preview_label.style().unpolish(self.preview_label)
        self.preview_label.style().polish(self.preview_label)
        self.info_label.setText("No image selected")
        self._sync_buttons()
        self.on_change_callback()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.base_image is not None:
            self._refresh_preview()

    def _refresh_preview(self):
        processed = self.get_processed_image()
        if processed is None:
            return
        try:
            pix = pil_to_qpixmap(processed)
            target_size = self.preview_label.size() - QSize(12, 12)
            if target_size.width() > 20 and target_size.height() > 20:
                scaled = pix.scaled(
                    target_size,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
            else:
                scaled = pix
            self.preview_label.setText("")
            self.preview_label.setPixmap(scaled)
            self.preview_label.setProperty("hasImage", True)
            self.preview_label.style().unpolish(self.preview_label)
            self.preview_label.style().polish(self.preview_label)

            name = Path(self.source_path).name if self.source_path else "Image"
            crop_tag = " · Cropped" if self.crop_ratios else ""
            rot_tag = f" · {self.rotation_deg}°" if self.rotation_deg else ""
            self.info_label.setText(
                f"{name} ({processed.width}×{processed.height}){rot_tag}{crop_tag}"
            )
        finally:
            processed.close()


class CNICCopyMakerWindow(QMainWindow):
    """Main compact Windows desktop window for CNIC Copy Maker."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(880, 560)
        self.setMinimumSize(780, 500)

        self.settings = QSettings("CNICCopyMaker", "DesktopApp")
        self.output_folder = self.settings.value(
            "output_folder", get_default_output_folder(), type=str
        )
        self.last_generated_pdf: Optional[str] = None

        self._build_ui()
        self._sync_action_states()

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        main = QVBoxLayout(central)
        main.setContentsMargins(16, 14, 16, 16)
        main.setSpacing(12)

        # Header row
        header = QHBoxLayout()
        title = QLabel(APP_NAME)
        title.setStyleSheet("font-size: 18px; font-weight: 700; color: #FFFFFF;")
        header.addWidget(title)

        subtitle = QLabel("Offline A4 PDF Generator")
        subtitle.setObjectName("MutedText")
        subtitle.setStyleSheet("font-size: 12px; color: #94A3B8; padding-left: 8px;")
        header.addWidget(subtitle)
        header.addStretch()

        self.status_label = QLabel("Ready — upload front and back CNIC images")
        self.status_label.setObjectName("MutedText")
        header.addWidget(self.status_label)
        main.addLayout(header)

        # Two side-by-side preview panels: FRONT & BACK
        panels_row = QHBoxLayout()
        panels_row.setSpacing(12)
        self.front_panel = ImageSlotPanel("Front", self._sync_action_states, self)
        self.back_panel = ImageSlotPanel("Back", self._sync_action_states, self)
        panels_row.addWidget(self.front_panel, 1)
        panels_row.addWidget(self.back_panel, 1)
        main.addLayout(panels_row, 1)

        # Settings bar (Arrangement + Output Folder)
        options_bar = QFrame()
        options_bar.setObjectName("ControlBar")
        opt_layout = QHBoxLayout(options_bar)
        opt_layout.setContentsMargins(14, 10, 14, 10)
        opt_layout.setSpacing(16)

        arr_label = QLabel("A4 Arrangement:")
        arr_label.setStyleSheet("font-weight: 600; color: #CBD5E1;")
        opt_layout.addWidget(arr_label)

        self.radio_vertical = QRadioButton("Vertical (Stacked)")
        self.radio_horizontal = QRadioButton("Horizontal (Side-by-Side)")
        self.radio_vertical.setChecked(True)

        self.arrangement_group = QButtonGroup(self)
        self.arrangement_group.addButton(self.radio_vertical)
        self.arrangement_group.addButton(self.radio_horizontal)

        opt_layout.addWidget(self.radio_vertical)
        opt_layout.addWidget(self.radio_horizontal)

        opt_layout.addStretch()

        folder_title = QLabel("Output Folder:")
        folder_title.setStyleSheet("font-weight: 600; color: #CBD5E1;")
        opt_layout.addWidget(folder_title)

        self.folder_label = QLabel(self._truncate_path(self.output_folder))
        self.folder_label.setToolTip(self.output_folder)
        self.folder_label.setObjectName("MutedText")
        opt_layout.addWidget(self.folder_label)

        self.btn_select_folder = QPushButton("Select Folder")
        self.btn_select_folder.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_select_folder.clicked.connect(self.select_output_folder)
        opt_layout.addWidget(self.btn_select_folder)

        main.addWidget(options_bar)

        # Action bar: Open PDF, Open Folder, Reset, and prominent GENERATE PDF
        actions_row = QHBoxLayout()
        actions_row.setSpacing(8)

        self.btn_open_pdf = QPushButton("Open PDF")
        self.btn_open_pdf.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_open_pdf.clicked.connect(self.open_last_pdf)
        actions_row.addWidget(self.btn_open_pdf)

        self.btn_open_folder = QPushButton("Open Folder")
        self.btn_open_folder.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_open_folder.clicked.connect(self.open_output_folder)
        actions_row.addWidget(self.btn_open_folder)

        self.btn_reset = QPushButton("Reset")
        self.btn_reset.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_reset.clicked.connect(self.reset_all)
        actions_row.addWidget(self.btn_reset)

        actions_row.addStretch()

        self.btn_generate = QPushButton("GENERATE PDF")
        self.btn_generate.setObjectName("PrimaryButton")
        self.btn_generate.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_generate.clicked.connect(self.generate_pdf)
        actions_row.addWidget(self.btn_generate)

        main.addLayout(actions_row)

    @staticmethod
    def _truncate_path(path_str: str, max_len: int = 38) -> str:
        if len(path_str) <= max_len:
            return path_str
        return "..." + path_str[-(max_len - 3) :]

    def _sync_action_states(self):
        ready = (
            self.front_panel.base_image is not None
            and self.back_panel.base_image is not None
        )
        self.btn_generate.setEnabled(ready)
        self.btn_open_pdf.setEnabled(
            self.last_generated_pdf is not None and os.path.exists(self.last_generated_pdf)
        )

    def select_output_folder(self):
        chosen = QFileDialog.getExistingDirectory(
            self,
            "Select Output Folder",
            self.output_folder if os.path.exists(self.output_folder) else str(Path.home()),
        )
        if chosen:
            self.output_folder = chosen
            self.settings.setValue("output_folder", chosen)
            self.folder_label.setText(self._truncate_path(chosen))
            self.folder_label.setToolTip(chosen)

    def generate_pdf(self):
        front_img = self.front_panel.get_processed_image()
        back_img = self.back_panel.get_processed_image()
        if front_img is None or back_img is None:
            QMessageBox.warning(
                self,
                "Missing Images",
                "Please upload both Front and Back CNIC images first.",
            )
            return

        os.makedirs(self.output_folder, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        pdf_path = os.path.join(self.output_folder, f"CNIC_Copy_{stamp}.pdf")
        counter = 1
        while os.path.exists(pdf_path):
            pdf_path = os.path.join(self.output_folder, f"CNIC_Copy_{stamp}_{counter}.pdf")
            counter += 1

        temp_files = []
        try:
            # Create temporary JPEG images for high-quality ReportLab embedding
            for img in (front_img, back_img):
                tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
                tmp_path = tmp.name
                tmp.close()
                temp_files.append(tmp_path)
                img.save(tmp_path, format="JPEG", quality=95, optimize=True)

            page_w, page_h = A4  # 595.27 x 841.89 points
            margin = 32.0
            gap = 20.0
            is_vertical = self.radio_vertical.isChecked()

            pdf = canvas.Canvas(pdf_path, pagesize=A4)
            pdf.setTitle("CNIC Copy")
            pdf.setCreator(APP_NAME)

            if is_vertical:
                slot_w = page_w - 2 * margin
                slot_h = (page_h - 2 * margin - gap) / 2.0
                slots = [
                    (margin, page_h - margin - slot_h, slot_w, slot_h),  # Top: Front
                    (margin, margin, slot_w, slot_h),                    # Bottom: Back
                ]
            else:
                slot_w = (page_w - 2 * margin - gap) / 2.0
                slot_h = page_h - 2 * margin
                slots = [
                    (margin, margin, slot_w, slot_h),                    # Left: Front
                    (margin + slot_w + gap, margin, slot_w, slot_h),     # Right: Back
                ]

            for img, tmp_path, (sx, sy, sw, sh) in zip(
                (front_img, back_img), temp_files, slots
            ):
                scale = min(sw / img.width, sh / img.height)
                draw_w = img.width * scale
                draw_h = img.height * scale
                draw_x = sx + (sw - draw_w) / 2.0
                draw_y = sy + (sh - draw_h) / 2.0
                pdf.drawImage(
                    tmp_path,
                    draw_x,
                    draw_y,
                    width=draw_w,
                    height=draw_h,
                    preserveAspectRatio=True,
                )

            pdf.showPage()
            pdf.save()

            self.last_generated_pdf = pdf_path
            self.status_label.setText(f"Saved: {Path(pdf_path).name}")
            self._sync_action_states()
        except Exception as exc:
            QMessageBox.critical(
                self,
                "PDF Generation Failed",
                f"Could not generate PDF:\n{exc}",
            )
        finally:
            front_img.close()
            back_img.close()
            for tmp_path in temp_files:
                try:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
                except OSError:
                    pass

    def open_last_pdf(self):
        if self.last_generated_pdf and os.path.exists(self.last_generated_pdf):
            QDesktopServices.openUrl(QUrl.fromLocalFile(self.last_generated_pdf))

    def open_output_folder(self):
        os.makedirs(self.output_folder, exist_ok=True)
        if (
            sys.platform.startswith("win")
            and self.last_generated_pdf
            and os.path.exists(self.last_generated_pdf)
        ):
            subprocess.Popen(
                ["explorer", "/select,", os.path.normpath(self.last_generated_pdf)]
            )
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(self.output_folder))

    def reset_all(self):
        self.front_panel.clear()
        self.back_panel.clear()
        self.last_generated_pdf = None
        self.status_label.setText("Ready — upload front and back CNIC images")
        self._sync_action_states()


def main():
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setStyle("Fusion")
    app.setStyleSheet(DARK_STYLESHEET)

    window = CNICCopyMakerWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
