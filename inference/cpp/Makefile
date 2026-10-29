CXX ?= g++
CXXFLAGS ?= -O3 -Wall -Wextra -std=c++17 -fPIC

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	TARGET = libclinix_accel.dylib
	LDFLAGS = -shared
else
	TARGET = libclinix_accel.so
	LDFLAGS = -shared -Wl,-soname,$(TARGET)
endif

all: $(TARGET)

$(TARGET): inference_accelerator.cpp inference_accelerator.h
	$(CXX) $(CXXFLAGS) $(LDFLAGS) -o $@ $<

clean:
	rm -f libclinix_accel.so libclinix_accel.dylib
