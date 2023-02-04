const ChildProcess = require("node:child_process");
require("./Server.js");
const {app, BrowserWindow} = require("electron");

class DeferredPromise extends Promise{
  static{
    DeferredPromise.prototype.constructor = Promise;
  }
  constructor(Options = {}){
    let resolve, reject;
    super(function(Resolve, Reject){
      resolve = Resolve;
      reject = Reject;
    });
    this.State = 0;
    this.resolve = function(){
      this.State = 1;
      resolve();
    }.bind(this);
    this.reject = function(){
      this.State = 2;
      reject();
    }.bind(this);

    Object.defineProperties(this, {
      "IsPending":{
        "get": function(){
          return this.State === 0;
        }.bind(this)
      },
      "IsFulfilled":{
        "get": function(){
          return this.State === 1;
        }.bind(this)
      },
      "IsRejected":{
        "get": function(){
          return this.State === 2;
        }.bind(this)
      }
    });

    if(Options.Timeout){
      globalThis.setTimeout((Options.Throw ?? true ? this.reject : this.resolve).bind(this), +Options.Timeout);
    }
  }
}

function Build(){
  const Process = ChildProcess.exec("npm run build");
  const BuildPromise = new DeferredPromise;
  console.log("Started webpack build");
  Process.stdout.on("data", function(Data){
    console.log(`Info: ${Data}`);
  });
  Process.stderr.on("data", function(Data){
    console.log(`Error: ${Data}`);
  });
  Process.on("close", function(ExitCode){
    console.log(`Webpack build exited with code ${ExitCode}`);
    BuildPromise.resolve();
  });
  return BuildPromise;
}


function OpenWindow(){
  const Window = new BrowserWindow({
    "width": 1280,
    "height": 720
  });
  Window.setMenuBarVisibility(false);
  Window.loadURL("http://127.0.0.1:27/dist/index.html");
  Window.setProgressBar(1);
}

void async function(){
  await app.whenReady();

  /*await*/ Build();
  OpenWindow();

  app.on("window-all-closed", async function(){
    //if(process.platform !== "darwin") app.quit();
    //await Build();
    OpenWindow();
  });
}();