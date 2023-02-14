;;#include "./Constants/Memory.mjs"
(module
  (import "Main" "MemoryBuffer" (memory 256 65536 shared))
  (func (export "DoThing") (param i32 i32) (result i32)
    local.get 1
    local.get 0
    i32.sub
;;#unroll 1
    i32.const I_HEAP
    i32.add
;;#end-unroll
  )
  (func (export "Write") (param i32 i32)
    local.get 0
    i32.const 2
    i32.shl
    local.get 1
    i32.store offset=0
  )
)