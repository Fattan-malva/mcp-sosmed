# Dimodifikasi untuk mcp-sosmed: modul Twitter/X dihapus, dan loader memakai
# importlib (find_module/load_module sudah dihapus di Python 3.12+).
import importlib
import pkgutil


__all__ = []


def _import_modules():
	prefixLen = len(__name__) + 1
	for _importer, moduleName, isPkg in pkgutil.iter_modules(__path__, prefix = f'{__name__}.'):
		assert not isPkg
		moduleNameWithoutPrefix = moduleName[prefixLen:]
		__all__.append(moduleNameWithoutPrefix)
		globals()[moduleNameWithoutPrefix] = importlib.import_module(moduleName)


_import_modules()
