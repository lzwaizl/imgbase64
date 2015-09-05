#!/usr/bin/env node

var fs = require("fs"),
    http = require("http"),
    path = require("path"),
    async = require("async"),
    imageinfo = require("imageinfo");

var patternImg = /[a-zA-z-]{10,}\:\s*url\([\"\']?([^\'\"\)]+)[\'\"\)]?\)([^\/]+\/\*[^\*]+\*\/)*/gmi,
    patternBgImg = /[a-zA-z-]{10,}\:\s*url\([\"\']?([^\'\"\)]+)[\'\"\)]?\)/gmi,
    patternCommentBg = /\/\*([^\*]+)\*\//,
    patternTrim = /(^\s*)|(\s*$)/g,
    patternIsBase64Img = /^data\:image/,
    patternOnlineUrl = /^http|https|\/\//;

var ing = false,
    allImgMsg = [],
    allImgCount = 0,
    rootPath = "";

var existsFile = function () {
    if (!process.argv[2]) {
        throw "error: need file";
    }
    var filePath = process.argv[2];
    rootPath = filePath.replace(/\/[^\/]*$/, "");
    return fs.existsSync(filePath) ? filePath : null;
};


var matchIconStyle = function(content) {
    var result = [];
    content.replace(patternImg, function(_, $1, $2) {//console.log(arguments)
        result.push({
            cur: $1
            //old: ($2 || null) && $2.match(patternCommentBg)[1].replace(patternTrim, "")
        });
    });
    return result ? result : null;
};


var base64_encode = function (file) {
    var bitmap = fs.readFileSync(file);
    return new Buffer(bitmap).toString('base64');
};

var replaceContent = function (fileImgMsg) {
    // console.log(JSON.stringify(fileImgMsg));
    var name = fileImgMsg.name,
        content = fileImgMsg.content,
        msg = fileImgMsg.msg;

    for (var i = 0, len = msg.length; i < len; i++) {
        var item = msg[i];
        content = content.replace(item.imgUrl, item.base64);
    }    

    fs.writeFile(name, content, 'utf-8', function(err) {
        if (err) {
            console.error(err);
        } else {
            console.log("文件写入完毕！");
        }
    });
   
};


// 从指定目录模糊获取文件集合
// var fromDir = function(startPath, filter, callback) {

//     if (!fs.existsSync(startPath)) {
//         console.log("no dir ", startPath);
//         return;
//     }

//     var files = fs.readdirSync(startPath);

//     for (var i = 0, len = files.length; i < len; i++) {
//         var fileName = path.join(startPath, files[i]),
//             stat = fs.lstatSync(fileName);
//         if (stat.isDirectory()) {
//             fromDir(fileName, filter); //recurse
//         } else if (fileName.indexOf(filter) >= 0) {
//             callback(fileName);
//         };
//     }
// };

// var base64_decode = function (base64str, file) {
//     var bitmap = new Buffer(base64str, 'base64');
//     fs.writeFileSync(file, bitmap);
// }

// var getOriginImgName = function (url) {
//     var noUseIndex = url.indexOf("?"),
//         matcher = "";
//     if (noUseIndex != -1) {
//         url = url.substr(0, noUseIndex);
//     }
//     matcher = url.match(/\/([^\/\.]+)\.[^\.]+$/);
//     return matcher ? matcher[1] : null;
// }







var getOnlinePic = function (curUrl, fileName, fileContent, callbackMain) {

    async.waterfall([

        // 获取线上图片
        function (callback) {
            http.get(curUrl, function(res) {
                callback(null, res, fileName, fileContent, curUrl);
            });
        },

        // 这里必须初始化为空字符串，否则获取的img data会有问题
        function (res, fileName, fileContent, curUrl, callback) {
            var imgData = ""; 

            res.setEncoding("binary")
                .on("data", function(chunk) {
                    imgData += chunk;
                })
                .on("end", function(err) {
                    if (err) throw err;
                    callback(null, imgData, fileName, fileContent, curUrl)
                });
        },

        // 图片写入本地
        function(imgData, fileName, fileContent, curUrl) {
            var imgName = "./current";

            fs.writeFile(imgName, imgData, "binary", function(err) { 
                if (err) throw err;
                callbackMain(null, imgName, fileName, fileContent, curUrl);
            });
        }

    ]);
};

async.waterfall([

    // 读取当前文件夹下的 less 文件
    function(callback) {
        console.log("开始检查文件...");
        var filePath = existsFile();
        filePath && callback(null, filePath);
    },

    // 读取 less 文件，并获取 less 文件中的图片引用信息
    function(fileName, callback) {

        fs.readFile(fileName, 'utf8', function(err, content) {
            if (err) throw err;

            console.log("开始分析文件...")
            callback(null, fileName, matchIconStyle(content), content);
        });

    },

    // 遍历图片
    function(name, url, content, callback) {
        var i = 0,
            cur, old, len = url.length;

        setTimeout(function () {

            if (!ing) {
                setTimeout(arguments.callee, 100);  

                if (allImgCount == len) {
                    ing = true;
                    fs.unlink("./current");
                    console.log("全部图片已编码完成，准备写入文件...")
                    replaceContent(allImgMsg);
                }
            }

        }, 100);

        console.log("正在编码图片...");

        for (; i < len; i++) {
            cur = url[i].cur;
            old = url[i].old;
            if (patternIsBase64Img.test(cur)) {
                continue;
            }
            callback(null, cur, name, content);
        }
    },

    // 获取图片
    function(curUrl, fileName, fileContent, callback) {

        if (patternOnlineUrl.test(curUrl)) { // 线上图片

            getOnlinePic(curUrl, fileName, fileContent, callback)

        } else { // 本地图片

            callback(null, rootPath  + "/" + curUrl.substr(2), fileName, fileContent, curUrl);
        }

    },

    // 读取图片信息
    function(imgName, fileName, fileContent, curUrl, callback) {

        fs.readFile(imgName, function(err, data) {
            if (err) throw err;

            var info = imageinfo(data);
            var imgType = info.format;
            var imgBase64 = "data:image/" + imgType + ";base64," + base64_encode(imgName);
            
            if (!allImgMsg["name"]) {
                allImgMsg["name"] = fileName;
                allImgMsg["content"] = fileContent;
                allImgMsg["msg"] = [];
            }

            allImgMsg["msg"].push({
                type: imgType,
                originSize: data.length,
                base64Size: imgBase64.length,
                width: info.width,
                height: info.height,
                imgUrl: curUrl,
                base64: imgBase64
            });
            console.log("[已完成]", curUrl)
            allImgCount++;
        });
    }

], function(err, result) { // 删除图片
    console.log("getfilesMsg done!");
});