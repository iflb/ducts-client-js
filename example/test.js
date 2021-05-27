const ducts = require("../lib/ducts");

let duct = new ducts.Duct()

duct.invoke_on_open(() => {
    console.log("hoge");
});

duct.open("http://localhost:8888/ducts/wsd");
