;;#include "./Constants/Memory.mjs"
(module
  (func (export "DoThing") (param i32 i32) (result i32)
    (;local.get 0
    local.get 1
    i32.add));)
    local.get 1
    local.get 0
    i32.sub

    i32.const I_HEAP
    i32.add
  )
)