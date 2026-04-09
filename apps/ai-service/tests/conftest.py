import sys
import os
import pytest
from unittest.mock import MagicMock
import numpy as np

# Ensure the ai-service root is importable for all tests
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app


@pytest.fixture(autouse=True)
def mock_app_state():
    """Initialize app.state so routes don't crash on missing models/settings.

    FastAPI's lifespan function (which sets app.state.models and
    app.state.settings) only runs when the server actually starts.
    TestClient in sync mode doesn't execute the lifespan by default,
    so we mock the state here.
    """
    mock_models = MagicMock()
    mock_models.get_status.return_value = {
        "embedding": {"loaded": True, "model": "all-MiniLM-L6-v2"},
        "spacy": {"loaded": True, "model": "en_core_web_trf"},
        "ocr": {"tesseract": {"available": True}},
    }

    # Configure encode() to return a proper array that .tolist() works on
    def encode_side_effect(texts, **kwargs):
        if isinstance(texts, list):
            return np.zeros((len(texts), 384))  # batch: shape (n, 384)
        return np.zeros(384)  # single text: shape (384,)

    mock_models.embedding_model.encode.side_effect = encode_side_effect

    mock_settings = MagicMock()
    mock_settings.ollama_base_url = "http://localhost:11434"
    mock_settings.embedding_model = "all-MiniLM-L6-v2"
    mock_settings.embedding_dim = 384

    app.state.models = mock_models
    app.state.settings = mock_settings
    yield
    # cleanup
    if hasattr(app.state, 'models'):
        del app.state.models
    if hasattr(app.state, 'settings'):
        del app.state.settings
