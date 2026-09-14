const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./test/browser',timeout:45000,workers:1,
  outputDir:'output/multi-map/browser',reporter:[['list']],
  use:{baseURL:'http://localhost:3198',viewport:{width:1499,height:1049},
    permissions:['microphone'],launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']},
    screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'NO_TLS=1 PORT=3198 node server.js',url:'http://localhost:3198',reuseExistingServer:false},
});
