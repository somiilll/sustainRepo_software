"""Make the golden-baseline support module importable for tests in this folder."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
