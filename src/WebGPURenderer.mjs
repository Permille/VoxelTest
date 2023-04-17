import {mat4} from "gl-matrix";
import * as M from "./Constants/Memory.mjs";
import {AddEventListener, FireEvent} from "./Events.mjs";
import MainShader from "./Shaders/WebGPU/Main.wgsl";
import RasterizationShader from "./Shaders/WebGPU/Compute.wgsl";

export default class WebGPURenderer{
  static IndexArray = new Uint8Array([0, 1, 2, 3, 4, 3, 5, 1, 6]);
  constructor(Canvas, Camera, Memory){
    this.Canvas = Canvas;
    this.Camera = Camera;
    this.Memory = Memory;
    this.FPS = 0;
    this.FrameTime = 10;
    this.LastRender = 0;
    this.Frames = 0;
    this.Events = new EventTarget;

    this.FOV = 70.;
    this.Near = 1.;
    this.Far = 2.;

    this.Initialised = false;
  }
  async Initialise(){
    if(!navigator.gpu) throw new Error("WebGPU is not supported");
    try{
      this.Adapter = await navigator.gpu.requestAdapter({
        "powerPreference": "high-performance"
      });
      this.Device = await this.Adapter.requestDevice();
      this.Context = this.Canvas.getContext("webgpu");
    } catch(e){
      throw new Error("WebGPU is not supported");
    }

    console.log(this.Device.limits);

    this.PresentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.Context.configure({
      "device": this.Device,
      "format": this.PresentationFormat,
      "alphaMode": "premultiplied"
    });


    this.UniformDataView = new DataView(new ArrayBuffer(256));
    this.UniformBuffer = this.Device.createBuffer({
      "size": this.UniformDataView.byteLength,
      "usage": GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.DataBuffer = this.Device.createBuffer({
      "size": this.Memory.MemorySize,
      "usage": GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.AtomicListIndicesBuffer = this.Device.createBuffer({
      "size": 16,
      "usage": GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });
    this.AtomicListIndicesBufferCopy = this.Device.createBuffer({
      "size": 16,
      "usage": GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    this.AtomicListSize = 1048576;
    this.AtomicListBuffer = this.Device.createBuffer({
      "size": this.AtomicListSize << 2,
      "usage": GPUBufferUsage.STORAGE
    });
    this.RenderListArray = new Uint32Array(131072);
    this.RenderListBuffer = this.Device.createBuffer({
      "size": this.RenderListArray.byteLength,
      "usage": GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    window.setTimeout(async function(){
      console.time();
      await this.Device.queue.writeBuffer(this.DataBuffer, 0, this.Memory.u32, 0, this.Memory.u32.length);
      console.timeEnd();
    }.bind(this), 2000);


    this.RasterizationShaderModule = this.Device.createShaderModule({"code": RasterizationShader});
    this.RasterizationBindGroupLayout = this.Device.createBindGroupLayout({
      "entries": [
        {
          "binding": 0,
          "visibility": GPUShaderStage.COMPUTE,
          "buffer": {
            "type": "read-only-storage"
          }
        },
        {
          "binding": 1,
          "visibility": GPUShaderStage.COMPUTE,
          "storageTexture": {
            "access": "write-only",
            "format": "rgba8unorm"
          }
        },
        {
          "binding": 2,
          "visibility": GPUShaderStage.COMPUTE,
          "buffer": {
            "type": "uniform"
          }
        },
        {
          "binding": 3,
          "visibility": GPUShaderStage.COMPUTE,
          "buffer": {
            "type": "storage"
          }
        },
        {
          "binding": 4,
          "visibility": GPUShaderStage.COMPUTE,
          "buffer": {
            "type": "storage"
          }
        },
        {
          "binding": 5,
          "visibility": GPUShaderStage.COMPUTE,
          "buffer": {
            "type": "read-only-storage"
          }
        }
      ]
    });


    this.RasterizationPipeline = this.Device.createComputePipeline({
      "layout": this.Device.createPipelineLayout({
        "bindGroupLayouts": [this.RasterizationBindGroupLayout]
      }),
      "compute": {
        "module": this.RasterizationShaderModule,
        "entryPoint": "Main",
        "constants": {
          //"Test": 0
        }
      }
    });



    this.RasterizationOutputTexture = null;
    this.RasterizationBindGroup = null;







    this.DrawingShaderModule = this.Device.createShaderModule({"code": MainShader});

    this.DrawingBindGroupLayout = this.Device.createBindGroupLayout({
      "entries": [
        {
          "binding": 0,
          "visibility": GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          "buffer": {
            "type": "uniform"
          }
        },
        {
          "binding": 1,
          "visibility": GPUShaderStage.FRAGMENT,
          "texture": {
            "sampleType": "float"
          }
        },
        {
          "binding": 2,
          "visibility": GPUShaderStage.FRAGMENT,
          "sampler": {
            "magFilter": "nearest",
            "minFilter": "nearest"
          }
        }
      ]
    });

    this.DrawingPipeline = this.Device.createRenderPipeline({
      "layout": this.Device.createPipelineLayout({
        "bindGroupLayouts": [this.DrawingBindGroupLayout]
      }),
      "vertex":{
        "module": this.DrawingShaderModule,
        "entryPoint": "VertexMain"
      },
      "fragment":{
        "module": this.DrawingShaderModule,
        "entryPoint": "FragmentMain",
        "targets": [
          {
            "format": this.PresentationFormat
          }
        ]
      },
      "primitive":{
        "topology": "triangle-list"
      }
    });


    this.DrawingBindGroup = null;





    window.addEventListener("resize", function Load(){
      this.Resize(window.innerWidth, window.innerHeight);
      return Load.bind(this);
    }.call(this));

    /*void function Load(){
      window.requestAnimationFrame(Load.bind(this));
      this.Render();
    }.call(this);*/

    this.Initialised = true;
    this.InitialiseDependencies();
    return this;
  }
  async InitialiseDependencies(){
    await InitialisedMain;
    Main.DebugInfo.Add(function(){
      return this.FPS + " fps";
    }.bind(this));
  }
  Resize(Width, Height){
    this.Canvas.width = Width;
    this.Canvas.height = Height;

    if(this.RasterizationOutputTexture !== null) this.RasterizationOutputTexture.destroy();
    this.RasterizationOutputTexture = this.Device.createTexture({
      "size": [Width, Height, 1],
      "format": "rgba8unorm",
      "usage": GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });

    this.RasterizationBindGroup = this.Device.createBindGroup({
      "layout": this.RasterizationBindGroupLayout,
      "entries": [
        {
          "binding": 0,
          "resource": {
            "buffer": this.DataBuffer
          }
        },
        {
          "binding": 1,
          "resource": this.RasterizationOutputTexture.createView()
        },
        {
          "binding": 2,
          "resource": {
            "buffer": this.UniformBuffer
          }
        },
        {
          "binding": 3,
          "resource": {
            "buffer": this.AtomicListIndicesBuffer
          }
        },
        {
          "binding": 4,
          "resource": {
            "buffer": this.AtomicListBuffer
          }
        },
        {
          "binding": 5,
          "resource": {
            "buffer": this.RenderListBuffer
          }
        }
      ]
    });

    this.DrawingBindGroup = this.Device.createBindGroup({
      "layout": this.DrawingPipeline.getBindGroupLayout(0),
      "entries": [
        {
          "binding": 0,
          "resource": {
            "buffer": this.UniformBuffer
          }
        },
        {
          "binding": 1,
          "resource": this.RasterizationOutputTexture.createView()
        },
        {
          "binding": 2,
          "resource": this.Device.createSampler({
            "magFilter": "nearest",
            "minFilter": "nearest"
          })
        }
      ]
    });

  }
  async Render(){
    if(!this.Initialised) return;
    const Now = window.performance.now();
    if(Math.floor(this.LastRender / 1000.) !== Math.floor(Now / 1000.)){
      this.FPS = this.Frames;
      this.Frames = 0;
    }
    this.FrameTime = Now - this.LastRender;
    this.LastRender = Now;
    this.Frames++;
    FireEvent(this.Events, new CustomEvent("BeforeRender"));




    const ProjectionMatrix = mat4.create();
    mat4.perspective(ProjectionMatrix, (this.FOV * Math.PI) / 180., this.Canvas.width / this.Canvas.height, this.Near, this.Far);

    const ModelViewMatrix = mat4.create();
    mat4.rotate(ModelViewMatrix, ModelViewMatrix, this.Camera.RotationY, [1, 0, 0]);
    mat4.rotate(ModelViewMatrix, ModelViewMatrix, this.Camera.RotationX, [0, 1, 0]);
    mat4.translate(ModelViewMatrix, ModelViewMatrix, [-this.Camera.PositionX, -this.Camera.PositionY, -this.Camera.PositionZ]);

    const ModelViewProjectionMatrix = mat4.create();
    mat4.mul(ModelViewProjectionMatrix, ProjectionMatrix, ModelViewMatrix);

    const InverseModelViewProjectionMatrix = mat4.create();
    mat4.invert(InverseModelViewProjectionMatrix, ModelViewProjectionMatrix);


    this.RenderListLength = this.CullRegions(ModelViewProjectionMatrix);
    this.Device.queue.writeBuffer(this.RenderListBuffer, 0, this.RenderListArray.buffer, this.RenderListArray.byteOffset, this.RenderListLength << 4);


    for(let i = 0; i < 16; ++i) this.UniformDataView.setFloat32(i << 2, ModelViewProjectionMatrix[i], true);
    for(let i = 0; i < 16; ++i) this.UniformDataView.setFloat32(64 | i << 2, InverseModelViewProjectionMatrix[i], true);
    this.UniformDataView.setFloat32(128, window.performance.now() / 1000., true);
    this.UniformDataView.setUint32(132, this.AtomicListSize, true);
    this.UniformDataView.setFloat32(136, window.innerWidth, true);
    this.UniformDataView.setFloat32(140, window.innerHeight, true);
    this.UniformDataView.setFloat32(144, this.Camera.RotationX, true);
    this.UniformDataView.setFloat32(148, this.Camera.RotationY, true);
    this.UniformDataView.setUint32(152, this.RenderListLength, true);
    this.UniformDataView.setFloat32(160, this.Camera.PositionX, true);
    this.UniformDataView.setFloat32(164, this.Camera.PositionY, true);
    this.UniformDataView.setFloat32(168, this.Camera.PositionZ, true);
    this.Device.queue.writeBuffer(this.UniformBuffer, 0, this.UniformDataView.buffer, this.UniformDataView.byteOffset, this.UniformDataView.byteLength);



    const CommandEncoder = this.Device.createCommandEncoder();

    const ClearingPassEncoder = CommandEncoder.beginRenderPass({
      "colorAttachments": [
        {
          "view": this.RasterizationOutputTexture.createView(),
          "clearValue": {"r": 0, "g": 0, "b": 0, "a": 1},
          "loadOp": "clear",
          "storeOp": "store"
        }
      ]
    });
    ClearingPassEncoder.end();

    this.Device.queue.writeBuffer(this.AtomicListIndicesBuffer, 0, new ArrayBuffer(16), 0, 16);


    const RasterizationPassEncoder = CommandEncoder.beginComputePass();
    RasterizationPassEncoder.setPipeline(this.RasterizationPipeline);
    RasterizationPassEncoder.setBindGroup(0, this.RasterizationBindGroup);
    RasterizationPassEncoder.dispatchWorkgroups(1, 1, 1);
    RasterizationPassEncoder.end();

    const DrawingPassEncoder = CommandEncoder.beginRenderPass({
      "colorAttachments": [
        {
          "view": this.Context.getCurrentTexture().createView(),
          "clearValue": {"r": 0, "g": 0, "b": 0, "a": 1},
          "loadOp": "clear",
          "storeOp": "store"
        }
      ]
    });
    DrawingPassEncoder.setPipeline(this.DrawingPipeline);
    DrawingPassEncoder.setBindGroup(0, this.DrawingBindGroup);
    DrawingPassEncoder.draw(3, 1, 0, 0);
    DrawingPassEncoder.end();
    this.Device.queue.submit([CommandEncoder.finish()]);

    if(this.AtomicListIndicesBufferCopy.mapState !== "unmapped") return;

    const NewCommandEncoder = this.Device.createCommandEncoder();
    await this.AtomicListIndicesBufferCopy.mapAsync(GPUMapMode.READ);
    //console.log(...new Uint32Array(this.AtomicListIndicesBufferCopy.getMappedRange()));
    this.AtomicListIndicesBufferCopy.unmap();

    NewCommandEncoder.copyBufferToBuffer(this.AtomicListIndicesBuffer, 0, this.AtomicListIndicesBufferCopy, 0, 16);
    this.Device.queue.submit([NewCommandEncoder.finish()]);
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

      this.RenderListArray[i] = RegionID;

      const Instances = this.Memory.u32[Allocation128HeapIndex + 530];
      this.RenderInstances += Instances;
    }

    return this.RenderListLength;
  }
};