# Universal Context-Aware Emission Calculation Engine
# This module provides a fully dynamic, configuration-driven emissions calculation system
# that supports multiple computation models without hardcoded formulas.

from .models import *
from .engine import CalculationEngine
from .resolver import ParameterResolver

__version__ = "1.0.0"
