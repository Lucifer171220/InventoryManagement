import os
import uuid
from typing import List, Literal

import matplotlib.pyplot as plt

# Directory to store generated chart images (ensure it exists)
_CHART_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "charts")
os.makedirs(_CHART_DIR, exist_ok=True)


def generate_chart(
    chart_type: Literal["line", "bar", "pie"],
    labels: List[str],
    values: List[float],
    title: str = "",
) -> str:
    """Create a chart image and return the relative file path.

    The function uses Matplotlib to render the requested chart type and saves it as a PNG
    with a unique filename under ``backend/app/static/charts``. The caller can then serve
    the file via a static files route or embed the path in API responses.
    """
    plt.figure(figsize=(8, 4))
    if chart_type == "line":
        plt.plot(labels, values, marker="o")
    elif chart_type == "bar":
        plt.bar(labels, values)
    elif chart_type == "pie":
        plt.pie(values, labels=labels, autopct="%1.1f%%")
    else:
        raise ValueError(f"Unsupported chart type: {chart_type}")

    if title:
        plt.title(title)
    plt.tight_layout()

    filename = f"{uuid.uuid4().hex}.png"
    file_path = os.path.join(_CHART_DIR, filename)
    plt.savefig(file_path, dpi=150)
    plt.close()
    # Return path relative to the project root for easy URL construction
    relative_path = os.path.relpath(file_path, start=os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    return relative_path.replace(os.sep, "/")
