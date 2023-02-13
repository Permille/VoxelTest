const ChildProcess = require("node:child_process");
require("./Server.js");
const {app, BrowserWindow} = require("electron");

class Main{
  constructor(){
    this.Process = this.Build();
    this.Window = this.OpenWindow();

    app.on("window-all-closed", function(){
      this.Window = this.OpenWindow();
    }.bind(this));
  }
  OpenWindow(){
    const Window = new BrowserWindow({
      "width": 1280,
      "height": 720
    });
    Window.setMenuBarVisibility(false);
    Window.loadURL("http://127.0.0.1:27/dist/index.html");
    Window.setProgressBar(1);
    return Window;
  }
  Build(){
    const Process = ChildProcess.exec("npm run build-dev");
    console.log("Started webpack build");
    Process.stdout.on("data", function(Data){
      console.log(`Info: ${Data}`);
      this.SendMessage("Build");
    }.bind(this));
    Process.stderr.on("data", function(Data){
      console.log(`Error: ${Data}`);
      this.SendMessage("Error");
    }.bind(this));
    Process.on("close", function(ExitCode){
      console.log(`Webpack build exited with code ${ExitCode}`);
    }.bind(this));
    return Process;
  }
  SendMessage(Message){

  }
}
void async function(){
  await app.whenReady();
  new Main;
}();