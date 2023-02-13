export const UNLOCKED = 0;
export const LOCKED = 1;

export const I_MEMORY_SIZE = 0;
export const I_WORLD_GRID_INDEX = 1;
export const I_HEIGHT_DATA_INDEX = 2;
export const I_HEIGHT_DATA_COUNT = 3;
export const I_HEIGHT_DATA_INFO_INDEX = 4;
export const I_ALLOCATION_SEGMENTS_LIST_INDEX = 5;
export const I_ALLOCATION_SEGMENTS_COUNT = 6;
export const I_ATOMIC_LOCKDOWN = 7;
export const I_UPDATED_LOD_LEVELS_MASK = 8;
export const I_WORLD_GRID_INFO_INDEX = 9;

export const I_INFO_LOADED_CUBES_COUNTER = 16;

export const I_LOADED_VOLUME_BOUNDS_START = 32;
export const MIN_X = 0;
export const MIN_Y = 1;
export const MIN_Z = 2;
export const MAX_X = 4;
export const MAX_Y = 5;
export const MAX_Z = 6;

export const I_HEIGHT_DATA_INFO_USAGE_COUNTER = 0;
export const I_HEIGHT_DATA_INFO_MANAGEMENT_LOCK = 1;

export const I_HEAP = 65535;
export const I_STACK = 65534;
export const I_LIST_START = I_STACK; //The list starts directly after the top of the stack, so these indices are the same.
export const I_LIST_END = 65533;
export const I_DEALLOCATION_COUNT = 65532;
export const I_MANAGEMENT_LOCK = 65531; // This lock is used for memory defragmentation and for uploading the segment to the gpu.
export const I_ALLOCATION_LOCK = 65530; // This lock is used for allocation, but shouldn't be used for deallocation which doesn't need any locks.
export const I_USAGE_COUNTER = 65529;
export const I_NEEDS_GPU_UPLOAD = 65528;

export const MASK_GENERATING = 1;
export const MASK_GENERATED = 2;
export const MASK_UPLOADED = 4;
export const MASK_UNLOADED = 8;
export const MASK_IS_EMPTY = 16;