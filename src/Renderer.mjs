import {mat4} from "gl-matrix";
import * as M from "./Constants/Memory.mjs";
import CubePassVsh from "./Shaders/CubePass.vsh";
import CubePassFsh from "./Shaders/CubePass.fsh";
import Clear2u32Fsh from "./Shaders/Clear2u32.fsh";
import FullscreenVsh from "./Shaders/Fullscreen.vsh";
import VoxelPassFsh from "./Shaders/VoxelPass.fsh";
import NearCubePassFsh from "./Shaders/NearCubePass.fsh";
import NearCubePassVsh from "./Shaders/NearCubePass.vsh";
import {AddEventListener, FireEvent} from "./Events.mjs";

export default class Renderer{
  static IndexArray = new Uint8Array([0,1,2,3,4,3,5,1,6]);
  constructor(Canvas, Camera, Memory){
    this.Canvas = Canvas;
    this.Camera = Camera;
    this.Memory = Memory;
    this.gl = this.Canvas.getContext("webgl2", {
      "antialias": false,
      "stencil": false,
      "power-preference": "high-performance",
      "desynchronized": false,
      "depth": false
    });
    const gl = this.gl;

    this.Events = new EventTarget;

    this.FrameTime = NaN;

    this.FOV = 70.;
    this.Near = 4.;
    this.Far = 24000.;

    this.CanvasScale = 1.;

    this.LastRender = 0.;
    this.Frames = 0;
    this.FPS = 0;

    this.Renderbuffer = null; //These will be generated when Resize is called
    this.FramebufferTexture = null;
    this.Framebuffer = null;


    this.NearCubeShaderProgram = this.InitShaderProgram(NearCubePassVsh, NearCubePassFsh);
    this.VoxelShaderProgram = this.InitShaderProgram(CubePassVsh, CubePassFsh);
    this.ProcessShaderProgram = this.InitShaderProgram(FullscreenVsh, VoxelPassFsh);
    this.ClearBufferShaderProgram = this.InitShaderProgram(FullscreenVsh, Clear2u32Fsh);
    this.NearCubeUniforms = this.GetUniformLocations(this.NearCubeShaderProgram, [
      "iFOV",
      "iCameraPosition",
      "iCameraRotation",
      "iData",
      "iResolution"
    ]);
    this.VoxelUniforms = this.GetUniformLocations(this.VoxelShaderProgram, [
      "iModelViewMatrix",
      "iProjectionMatrix",
      "iModelViewProjectionMatrix",
      "iCameraPosition",
      "iData",
      "iRenderList"
    ]);
    this.ProcessUniforms = this.GetUniformLocations(this.ProcessShaderProgram, [
      "iVoxelPassTexture",
      "iData"
    ]);

    this.IndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.IndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Renderer.IndexArray, gl.STATIC_DRAW);

    this.EmptyBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.EmptyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(1), gl.STATIC_DRAW);

    this.DataTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.DataTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R32UI, 2048, 2048, this.Memory.MemorySize >> 22 >> 2); //Shifted by extra 2 because this size is in 4 byte integers

    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    this.RenderListArray = new Uint32Array(131072).fill(0xffffffff);

    this.RenderInstances = 0;
    this.RenderListLength = 65535;

    this.RenderListTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.RenderListTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG32UI, 256, 256);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 256, gl.RG_INTEGER, gl.UNSIGNED_INT, this.RenderListArray);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    gl.useProgram(this.NearCubeShaderProgram);
    gl.bindAttribLocation(this.NearCubeShaderProgram, 0, "vEmpty");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.EmptyBuffer);
    gl.vertexAttribPointer(0, 1, gl.UNSIGNED_INT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    gl.uniform1i(this.NearCubeShaderProgram.iData, 0);



    gl.useProgram(this.VoxelShaderProgram);

    gl.bindAttribLocation(this.VoxelShaderProgram, 0, "vEmpty");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.EmptyBuffer);
    gl.vertexAttribPointer(0, 1, gl.UNSIGNED_INT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    gl.uniform1i(this.VoxelUniforms.iData, 0);
    gl.uniform1i(this.VoxelUniforms.iRenderList, 1);




    gl.useProgram(this.ProcessShaderProgram);
    gl.uniform1i(this.ProcessUniforms.iVoxelPassTexture, 8);

    gl.uniform1i(this.ProcessUniforms.iData, 0);


    gl.bindAttribLocation(this.ProcessShaderProgram, 0, "vEmpty");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.EmptyBuffer);
    gl.vertexAttribPointer(0, 1, gl.UNSIGNED_INT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    window.addEventListener("resize", this.Resize().bind(this));
    this.InitialiseDependencies();
  }
  async InitialiseDependencies(){
    await InitialisedMain;
    Main.DebugInfo.Add(function(){
      return this.FPS + " fps";
    }.bind(this));
  }
  GenerateVoxelPassFramebuffer(){
    const gl = this.gl;
    this.FramebufferTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.FramebufferTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32UI, this.Canvas.width, this.Canvas.height, 0, gl.RG_INTEGER, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    this.Framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.Framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.FramebufferTexture, 0);


    this.Renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.Renderbuffer);

    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.Canvas.width, this.Canvas.height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.Renderbuffer);
  }
  Resize(){
    const gl = this.gl;
    this.Canvas.width = window.innerWidth * this.CanvasScale;
    this.Canvas.height = window.innerHeight * this.CanvasScale;
    gl.viewport(0., 0., this.Canvas.width, this.Canvas.height);
    this.Canvas.style.width = "100vw";
    this.Canvas.style.height = "100vh";


    if(this.Framebuffer !== null) gl.deleteFramebuffer(this.Framebuffer);
    if(this.FramebufferTexture !== null) gl.deleteTexture(this.FramebufferTexture);
    if(this.Renderbuffer !== null) gl.deleteRenderbuffer(this.Renderbuffer);

    this.GenerateVoxelPassFramebuffer();
    return this.Resize;
  }
  UploadSegment(Segment){
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.DataTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, (Segment << 5) & 2047, Segment >> 6, 2048, 32, 1, gl.RED_INTEGER, gl.UNSIGNED_INT, this.Memory.u32, Segment << 16);
  }
  Render(){
    const gl = this.gl;
    const Now = window.performance.now();
    if(Math.floor(this.LastRender / 1000.) !== Math.floor(Now / 1000.)){
      this.FPS = this.Frames;
      this.Frames = 0;
    }
    this.FrameTime = Now - this.LastRender;
    this.LastRender = Now;
    this.Frames++;
    FireEvent(this.Events, new CustomEvent("BeforeRender"));

    gl.useProgram(null);

    const ProjectionMatrix = mat4.create();
    mat4.perspective(ProjectionMatrix, (this.FOV * Math.PI) / 180., this.Canvas.width / this.Canvas.height, this.Near, this.Far);

    const ModelViewMatrix = mat4.create();
    mat4.rotate(ModelViewMatrix, ModelViewMatrix, this.Camera.RotationY, [1, 0, 0]);
    mat4.rotate(ModelViewMatrix, ModelViewMatrix, this.Camera.RotationX, [0, 1, 0]);
    mat4.translate(ModelViewMatrix, ModelViewMatrix, [-this.Camera.PositionX, -this.Camera.PositionY, -this.Camera.PositionZ]);

    const ModelViewProjectionMatrix = mat4.create();
    mat4.mul(ModelViewProjectionMatrix, ProjectionMatrix, ModelViewMatrix);



    let UploadCounter = 0;
    const UpdatedLODLevels = this.Memory.u32[M.I_UPDATED_LOD_LEVELS_MASK];
    let UploadedLODLevels = 0;


    Outer: for(let Level = 0; Level < 16; ++Level){
      if(((UpdatedLODLevels >> Level) & 1) === 0) continue;

      const Offset = this.Memory.u32[M.I_WORLD_GRID_INDEX] + (Level << 15);
      for(let z = 0; z < 32; ++z) for(let y = 0; y < 32; ++y) for(let x = 0; x < 32; ++x){
        if(UploadCounter > 1) break Outer;
        const Mask = Atomics.load(this.Memory.u32, this.Memory.u32[M.I_WORLD_GRID_INFO_INDEX] + (Level << 13 | z << 8 | y << 3 | x >> 2)) >> ((x & 3) << 3);
        if((Mask & (M.MASK_UPLOADED | M.MASK_UNLOADED | M.MASK_IS_EMPTY)) !== 0 || (Mask & M.MASK_GENERATED) === 0) continue;
        const Region128_SegmentAndStackIndex = this.Memory.u32[Offset | z << 10 | y << 5 | x];
        if(Region128_SegmentAndStackIndex === 0){
          console.warn("This shouldn't have happened");
          continue;
        }
        Atomics.add(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);
        if(Atomics.load(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_MANAGEMENT_LOCK)){
          Atomics.sub(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);
          continue;
        }

        //This is for uploading the 128³ that holds references to the 16³s
        if(Atomics.load(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_NEEDS_GPU_UPLOAD) !== 0){
          UploadCounter++;
          this.UploadSegment(Region128_SegmentAndStackIndex >> 16);
          UploadedLODLevels |= 1 << Level;
          Atomics.store(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_NEEDS_GPU_UPLOAD, 0);
        }
        const Region128_HeapIndex = (Region128_SegmentAndStackIndex & ~65535) | Atomics.load(this.Memory.u32, Region128_SegmentAndStackIndex);
        const Length = this.Memory.u32[Region128_HeapIndex + 530];
        for(let i = 0; i < Length; ++i){
          const LocalCoordinate = this.Memory.u32[Region128_HeapIndex + 531 + i];
          const ChildSegmentAndStackIndex = this.Memory.u32[Region128_HeapIndex + 18 + LocalCoordinate];
          if(Atomics.load(this.Memory.u32, (ChildSegmentAndStackIndex & ~65535) | M.I_NEEDS_GPU_UPLOAD) !== 0){
            UploadCounter++;
            this.UploadSegment(ChildSegmentAndStackIndex >> 16);
            UploadedLODLevels |= 1 << Level;
            Atomics.store(this.Memory.u32, (ChildSegmentAndStackIndex & ~65535) | M.I_NEEDS_GPU_UPLOAD, 0);
          }
        }
        Atomics.or(this.Memory.u32, this.Memory.u32[M.I_WORLD_GRID_INFO_INDEX] + (Level << 13 | z << 8 | y << 3 | x >> 2), M.MASK_UPLOADED << ((x & 3) << 3));

        Atomics.sub(this.Memory.u32, (Region128_SegmentAndStackIndex & ~65535) | M.I_USAGE_COUNTER, 1);
      }
      this.Memory.u32[M.I_UPDATED_LOD_LEVELS_MASK] &= ~(1 << Level);
    }
    for(let Level = 0; Level < 16; ++Level) if(((UploadedLODLevels >> Level) & 1) === 1) this.UploadSegment(1 + Level);
    if(UpdatedLODLevels !== 0) this.UploadSegment(0); //This is to update the fully uploaded bitmap
    //for(let i = 0; i < 128; ++i) this.UploadSegment(i);

    const UpdateRegion = this.CullRegions(ModelViewProjectionMatrix);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.RenderListTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, /*round up to next 256 */ ((UpdateRegion + 255) & ~255) >> 8, gl.RG_INTEGER, gl.UNSIGNED_INT, this.RenderListArray);


    gl.bindFramebuffer(gl.FRAMEBUFFER, this.Framebuffer);
    gl.viewport(0, 0, this.Canvas.width, this.Canvas.height);



    gl.useProgram(this.NearCubeShaderProgram);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.ALWAYS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.uniform3f(this.NearCubeUniforms.iCameraPosition, this.Camera.PositionX, this.Camera.PositionY, this.Camera.PositionZ);
    gl.uniform3f(this.NearCubeUniforms.iCameraRotation, this.Camera.RotationX, this.Camera.RotationY, 0.);
    gl.uniform1f(this.NearCubeUniforms.iFOV, (this.FOV * Math.PI) / 180.);
    gl.uniform2f(this.NearCubeUniforms.iResolution, window.innerWidth, window.innerHeight);

    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);


    gl.useProgram(this.VoxelShaderProgram);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.uniformMatrix4fv(
      this.VoxelUniforms.iProjectionMatrix,
      false,
      ProjectionMatrix
    );
    gl.uniformMatrix4fv(
      this.VoxelUniforms.iModelViewMatrix,
      false,
      ModelViewMatrix
    );
    gl.uniformMatrix4fv(
      this.VoxelUniforms.iModelViewProjectionMatrix,
      false,
      ModelViewProjectionMatrix
    );
    gl.uniform3f(this.VoxelUniforms.iCameraPosition, this.Camera.PositionX, this.Camera.PositionY, this.Camera.PositionZ);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.IndexBuffer);
    gl.drawElementsInstanced(gl.TRIANGLE_STRIP, Renderer.IndexArray.length, gl.UNSIGNED_BYTE, 0, this.RenderInstances);


    //Render to canvas now
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.Canvas.width, this.Canvas.height);


    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.useProgram(this.ProcessShaderProgram);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  CullRegions(m){
    const ChunkSphereRadius = Math.sqrt(3. * (128. / 2.) ** 2.);
    const FrustumPlanes = new Float64Array([
      m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12],
      m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12],
      m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13],
      m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13],
      m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14],
      m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]
    ]);
    for(let i = 0; i < 6; ++i){
      const InverseLength = 1. / Math.hypot(FrustumPlanes[i << 2], FrustumPlanes[i << 2 | 1], FrustumPlanes[i << 2 | 2]);
      for(let j = 0; j < 4; ++j) FrustumPlanes[i << 2 | j] *= InverseLength;
    }

    this.RenderInstances = 0;

    const PreviousRenderListLength = this.RenderListLength;
    this.RenderListLength = 0;

    const RenderRegions = [];

    const WorldGridStart = this.Memory.u32[M.I_WORLD_GRID_INDEX];
    for(let z = 0; z < 32; ++z) for(let y = 0; y < 32; ++y) Iterator: for(let x = 0; x < 32; ++x){
      const Allocation128SegmentAndStackIndex = this.Memory.u32[WorldGridStart + (z << 10 | y << 5 | x)];
      if(Allocation128SegmentAndStackIndex === 0) continue;

      const X = (x + .5) * 128.;
      const Y = (y + .5) * 128.;
      const Z = (z + .5) * 128.;

      for(let i = 0; i < 24; i += 4){
        if(X * FrustumPlanes[i] + Y * FrustumPlanes[i | 1] + Z * FrustumPlanes[i | 2] + FrustumPlanes[i | 3] <- ChunkSphereRadius){
          continue Iterator; //Not in frustum
        }
      }

      RenderRegions.push(Math.floor(Math.hypot(X - this.Camera.PositionX, Y - this.Camera.PositionY, Z - this.Camera.PositionZ)) * 524288 + (0 << 15 | z << 10 | y << 5 | x));
      this.RenderListLength++;
    }

    RenderRegions.sort(function(A, B){
      return A - B;
    });

    for(let i = 0; i < this.RenderListLength; ++i){
      const RegionID = RenderRegions[i] & 524287;
      const Allocation128SegmentAndStackIndex = this.Memory.u32[WorldGridStart + RegionID];

      //TODO: This could be problematic, especially if this is accessed whilst the segment is being defragmented
      const Allocation128HeapIndex = (Allocation128SegmentAndStackIndex & ~65535) | this.Memory.u32[Allocation128SegmentAndStackIndex];

      this.RenderListArray[i << 1 | 0] = RegionID; //Allocation128SegmentAndStackIndex;
      this.RenderListArray[i << 1 | 1] = this.RenderInstances;

      const Instances = this.Memory.u32[Allocation128HeapIndex + 530];
      this.RenderInstances += Instances;
    }

    for(let i = this.RenderListLength; i < PreviousRenderListLength; ++i) this.RenderListArray[i << 1 | 1] = 0xffffffff;

    return Math.max(this.RenderListLength, PreviousRenderListLength);
  }
  SetCanvasScale(NewScale){
    this.CanvasScale = NewScale;
    this.Resize();
  }
  GetUniformLocations(Program, Uniforms){
    const gl = this.gl;
    const UniformsObject = {};
    for(const Uniform of Uniforms){
      UniformsObject[Uniform] = gl.getUniformLocation(Program, Uniform);
    }
    return UniformsObject;
  }
  InitShaderProgram(vsh, fsh){
    const gl = this.gl;
    const VertexShader = this.LoadShader(gl.VERTEX_SHADER, vsh);
    const FragmentShader = this.LoadShader(gl.FRAGMENT_SHADER, fsh);

    const ShaderProgram = gl.createProgram();
    gl.attachShader(ShaderProgram, VertexShader);
    gl.attachShader(ShaderProgram, FragmentShader);
    gl.linkProgram(ShaderProgram);

    if(!gl.getProgramParameter(ShaderProgram, gl.LINK_STATUS)){
      console.error(gl.getProgramInfoLog(ShaderProgram));
    }
    return ShaderProgram;
  }
  LoadShader(Type, Source){
    const gl = this.gl;
    const Shader = gl.createShader(Type);
    gl.shaderSource(Shader, Source);
    gl.compileShader(Shader);
    if(!gl.getShaderParameter(Shader, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(Shader));
    }
    return Shader;
  }
};