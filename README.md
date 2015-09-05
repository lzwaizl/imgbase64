
## 概述

对指定less文件下的所有background或background-image所引用的图片进行base64编码，然后替换原文件内容。

## 约定

less文件目录下，新建一个icons目录（记得ignore哦~），把less文件下所需要用到的图片都放入icons中，然后使用imgbase64 path/filename来执行文件。