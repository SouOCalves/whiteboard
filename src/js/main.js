import keymage from "keymage";
import { io } from "socket.io-client";
import whiteboard from "./whiteboard";
import keybinds from "./keybinds";
import Picker from "vanilla-picker";
import { dom } from "@fortawesome/fontawesome-svg-core";
import shortcutFunctions from "./shortcutFunctions";
import ReadOnlyService from "./services/ReadOnlyService";
import InfoService from "./services/InfoService";
import { getSubDir } from "./utils";
import ConfigService from "./services/ConfigService";
import { v4 as uuidv4 } from "uuid";

const pdfjsLib = require("pdfjs-dist");
const fs = require("fs");
const { parseStringPromise, parseString } = require("xml2js");

export class Symbol {
    constructor(symbol, drawId, tagName) {
        this.symbol = symbol;
        this.drawId = drawId;
        this.tagName = tagName;
        this.parent = undefined;
    }
}

export class RoseTreeNode {
    constructor(isExp) {
        this.exp = isExp;
        this.symbol = undefined;
        this.parent = undefined;
        this.backSibling = undefined;
        this.frontSibling = undefined;
        this.firstChild = undefined;
        this.lastChild = undefined;
    }

    setSymbol(symbol) {
        this.symbol = symbol;
    }

    setParent(parent) {
        this.parent = parent;
    }

    setBackSibling(backSibling) {
        this.backSibling = backSibling;
    }

    setFrontSibling(frontSibling) {
        this.frontSibling = frontSibling;
    }

    setFirstChild(firstChild) {
        this.firstChild = firstChild;
    }

    setLastChild(lastChild) {
        this.lastChild = lastChild;
    }
}

export class Expression {
    constructor() {
        this.symbols = [];
        this.rootNode = undefined;
    }

    appendSymbol(symbol) {
        this.symbols.push(symbol);
    }

    setRootNode(node) {
        this.rootNode = node;
    }
}

function checkOperator(symbol) {
    if (symbol.symbol == "=") return 1;
    if (symbol.symbol == "+" || symbol.symbol == "-") return 2;
    if (symbol.symbol == "*") return 3;
    if (symbol.symbol == "(") return 9999;
}

// function removeUndefined(node) {
//     let i = node.children.length;
//     while (i--) {
//         if (node.children[i] instanceof Node) {
//             node.children[i] = removeUndefined(node.children[i]);
//         }
//         else if (node.children[i] === undefined) {
//             node.children.splice(i, 1);
//         }
//     }
//     console.log(node);
//     return node;
// }

function getClosingParenthesesIndex(openingParanthesesIndex, array) {
    let openingParenthesesCount = 1;
    for (let i = openingParanthesesIndex + 1; i < array.length; i++) {
        if (array[i].symbol === '(') {
            openingParenthesesCount++;
        }
        if (array[i].symbol == ')') {
            openingParenthesesCount--;
        }
        if (openingParenthesesCount === 0) {
            return i;
        }
    }
    return undefined;
}

function orderByPrecedenceDescending(array) {
    let operatorArray = [];
    for (let i = 0; i < array.length; i++) {
        if (checkOperator(array[i]) != undefined) {
            operatorArray.push(array[i]);
            if (array[i].symbol === '(') {
                let closingParenthesesIndex = getClosingParenthesesIndex(i, array);
                if (closingParenthesesIndex !== undefined) {
                    i = closingParenthesesIndex;
                }
            }
        }
    }
    
    operatorArray.sort((a, b) => {
        if (checkOperator(a) > checkOperator(b)) {
            return -1;
        } else if (checkOperator(a) < checkOperator(b)) {
            return 1;
        } else {
            return operatorArray.indexOf(a) - operatorArray.indexOf(b);
        }
    });
    
    return operatorArray;
}

function getRootNode(symbol) {
    if (symbol.parent === undefined) {
        return symbol;
    }
    return getRootNode(symbol.parent);
}

function clearSymbolsParents(symbols) {
    for (let symbol of symbols) {
        symbol.parent = undefined;
    }
}

function checkPrecedence(node) {
    for (let child of node.children) {
        if (checkOperator(child) !== undefined) {
            return checkOperator(child);
        }
    }
}

export function buildTree(expression) {
    clearSymbolsParents(expression);
    let operatorArray = orderByPrecedenceDescending(expression);
    for (let operator of operatorArray) {
        let operatorSymbol = expression[expression.indexOf(operator)];
        let leftSymbol = expression[expression.indexOf(operator) - 1];
        let rightSymbol = expression[expression.indexOf(operator) + 1];
        
        if (operatorSymbol.symbol === '(') {
            let openingParenthesesIndex = expression.indexOf(operator);
            let closingParenthesesIndex = getClosingParenthesesIndex(openingParenthesesIndex, expression);
            let newNode = buildTree(expression.slice(openingParenthesesIndex + 1, closingParenthesesIndex));
            newNode.children.unshift(operatorSymbol);
            newNode.addChild(expression[closingParenthesesIndex]);
            operatorSymbol.parent = newNode;
            expression[closingParenthesesIndex].parent = newNode;
        }
        else {
            if (leftSymbol.parent === undefined && rightSymbol.parent === undefined) {
                let newNode = new Node();
                newNode.addChild(leftSymbol);
                newNode.addChild(operatorSymbol);
                newNode.addChild(rightSymbol);
                leftSymbol.parent = newNode;
                operatorSymbol.parent = newNode;
                rightSymbol.parent = newNode;
            }
            else if (leftSymbol.parent !== undefined && rightSymbol.parent !== undefined) {
                if (checkPrecedence(getRootNode(leftSymbol)) === checkOperator(operator)) {
                    getRootNode(leftSymbol).addChild(operatorSymbol);
                    getRootNode(leftSymbol).addChild(getRootNode(rightSymbol));
                    operatorSymbol.parent = getRootNode(leftSymbol);
                    getRootNode(rightSymbol).parent = getRootNode(leftSymbol);
                }
                else {
                    let newNode = new Node();
                    newNode.addChild(getRootNode(leftSymbol));
                    newNode.addChild(operatorSymbol);
                    newNode.addChild(getRootNode(rightSymbol));
                    getRootNode(leftSymbol).parent = newNode;
                    operatorSymbol.parent = newNode;
                    getRootNode(rightSymbol).parent = newNode;
                }
            }
            else if (leftSymbol.parent === undefined && rightSymbol.parent !== undefined) {
                let newNode = new Node();
                newNode.addChild(leftSymbol);
                newNode.addChild(operatorSymbol);
                newNode.addChild(getRootNode(rightSymbol));
                leftSymbol.parent = newNode;
                operatorSymbol.parent = newNode;
                getRootNode(rightSymbol).parent = newNode;
            }
            else if (leftSymbol.parent !== undefined && rightSymbol.parent === undefined) {
                if (checkPrecedence(getRootNode(leftSymbol)) === checkOperator(operator)) {
                    getRootNode(leftSymbol).addChild(operatorSymbol);
                    getRootNode(leftSymbol).addChild(rightSymbol);
                    operatorSymbol.parent = getRootNode(leftSymbol);
                    rightSymbol.parent = getRootNode(leftSymbol);
                }
                else {
                    let newNode = new Node();
                    newNode.addChild(getRootNode(leftSymbol));
                    newNode.addChild(operatorSymbol);
                    newNode.addChild(rightSymbol);
                    getRootNode(leftSymbol).parent = newNode;
                    operatorSymbol.parent = newNode;
                    rightSymbol.parent = newNode;
                }
            }
        }
    }
    return getRootNode(expression[0]);
}

// function buildNode(expression, node, precedence, targetPrecedence) {
//     if (expression === [] || expression === undefined) return;

//     node.addChild(expression[0]);

//     if (expression[2] === undefined) {
//         node.addChild(expression[1]);
//         return "";
//     } else {
//         if (checkOperator(expression[2]) <= targetPrecedence) {
//             node.addChild(expression[1]);
//             return expression.slice(2);
//         }
//     }
//     if (checkOperator(expression[2]) == precedence) {
//         node.addChild(expression[1]);
//         buildNode(expression.slice(2), node, precedence, targetPrecedence);
//     }
//     if (checkOperator(expression[2]) > precedence) {
//         let [newNode, remainingString] = buildTree(expression.slice(1), precedence);
//         node.addChild(newNode);
//         newNode.addParent(node);
//         buildNode(remainingString, node, checkOperator(expression[0]), targetPrecedence);
//     }
//     if (checkOperator(expression[2]) < precedence) {
//         node.addChild(expression[1]);
//         let newNode = new Node();
//         newNode.addChild(node);
//         node.addParent(newNode);
//         buildNode(expression.slice(2), newNode, checkOperator(expression[2]), targetPrecedence);
//     }
// }

export function buildParsedTree(rootNode, roseTreeRootNode) {
    let previousChild = undefined;
    for (let i = 0; i < rootNode.children.length; i++) {
        let newRoseTreeNode = undefined;
        if (rootNode.children[i] instanceof Node) {
            newRoseTreeNode = buildParsedTree(rootNode.children[i], new RoseTreeNode(true));
        } else {
            if (rootNode.children[i] instanceof Symbol) {
                newRoseTreeNode = new RoseTreeNode(false);
                newRoseTreeNode.setSymbol(rootNode.children[i]);
            }
        }

        if (previousChild instanceof RoseTreeNode) {
            newRoseTreeNode.setBackSibling(previousChild);
            previousChild.setFrontSibling(newRoseTreeNode);
        }
        previousChild = newRoseTreeNode;

        if (i == 0) {
            newRoseTreeNode.setParent(roseTreeRootNode);
            roseTreeRootNode.setFirstChild(newRoseTreeNode);
        } else {
            if (i == rootNode.children.length - 1) {
                newRoseTreeNode.setParent(roseTreeRootNode);
                roseTreeRootNode.setLastChild(newRoseTreeNode);
            }
        }
    }

    return roseTreeRootNode;
}

class Node {
    constructor() {
        this.children = [];
        this.parent = undefined;
    }

    addChild(child) {
        this.children.push(child);
    }

    addParent(node) {
        this.parent = node;
    }
}

const urlParams = new URLSearchParams(window.location.search);
let whiteboardId = urlParams.get("whiteboardid");
const randomid = urlParams.get("randomid");

if (randomid) {
    whiteboardId = uuidv4();
    urlParams.delete("randomid");
    window.location.search = urlParams;
}

if (!whiteboardId) {
    whiteboardId = "myNewWhiteboard";
}

whiteboardId = unescape(encodeURIComponent(whiteboardId)).replace(/[^a-zA-Z0-9\-]/g, "");

if (urlParams.get("whiteboardid") !== whiteboardId) {
    urlParams.set("whiteboardid", whiteboardId);
    window.location.search = urlParams;
}

const myUsername = urlParams.get("username") || "unknown" + (Math.random() + "").substring(2, 6);
const accessToken = urlParams.get("accesstoken") || "";
const copyfromwid = urlParams.get("copyfromwid") || "";

// Custom Html Title
const title = urlParams.get("title");
if (title) {
    document.title = decodeURIComponent(title);
}

const subdir = getSubDir();
let signaling_socket;

function main() {
    signaling_socket = io("", { path: subdir + "/ws-api" }); // Connect even if we are in a subdir behind a reverse proxy

    signaling_socket.on("connect", function () {
        console.log("Websocket connected!");

        signaling_socket.on("whiteboardConfig", (serverResponse) => {
            ConfigService.initFromServer(serverResponse);
            // Inti whiteboard only when we have the config from the server
            initWhiteboard();
        });

        signaling_socket.on("whiteboardInfoUpdate", (info) => {
            InfoService.updateInfoFromServer(info);
            whiteboard.updateSmallestScreenResolution();
        });

        signaling_socket.on("drawToWhiteboard", function (content) {
            whiteboard.handleEventsAndData(content, true);
            InfoService.incrementNbMessagesReceived();
        });

        signaling_socket.on("refreshUserBadges", function () {
            whiteboard.refreshUserBadges();
        });

        let accessDenied = false;
        signaling_socket.on("wrongAccessToken", function () {
            if (!accessDenied) {
                accessDenied = true;
                showBasicAlert("Access denied! Wrong accessToken!");
            }
        });

        signaling_socket.emit("joinWhiteboard", {
            wid: whiteboardId,
            at: accessToken,
            windowWidthHeight: { w: $(window).width(), h: $(window).height() },
        });
    });
}

function showBasicAlert(html, newOptions) {
    var options = {
        header: "INFO MESSAGE",
        okBtnText: "Ok",
        headercolor: "#d25d5d",
        hideAfter: false,
        onOkClick: false,
    };
    if (newOptions) {
        for (var i in newOptions) {
            options[i] = newOptions[i];
        }
    }
    var alertHtml = $(
        '<div class="basicalert" style="position:absolute; left:0px; width:100%; top:70px; font-family: monospace;">' +
            '<div style="width: 30%; margin: auto; background: #aaaaaa; border-radius: 5px; font-size: 1.2em; border: 1px solid gray;">' +
            '<div style="border-bottom: 1px solid #676767; background: ' +
            options["headercolor"] +
            '; padding-left: 5px; font-size: 0.8em;">' +
            options["header"] +
            '<div style="float: right; margin-right: 4px; color: #373737; cursor: pointer;" class="closeAlert">x</div></div>' +
            '<div style="padding: 10px;" class="htmlcontent"></div>' +
            '<div style="height: 20px; padding: 10px;"><button class="modalBtn okbtn" style="float: right;">' +
            options["okBtnText"] +
            "</button></div>" +
            "</div>" +
            "</div>"
    );
    alertHtml.find(".htmlcontent").append(html);
    $("body").append(alertHtml);
    alertHtml
        .find(".okbtn")
        .off("click")
        .click(function () {
            if (options.onOkClick) {
                options.onOkClick();
            }
            alertHtml.remove();
        });
    alertHtml
        .find(".closeAlert")
        .off("click")
        .click(function () {
            alertHtml.remove();
        });

    if (options.hideAfter) {
        setTimeout(function () {
            alertHtml.find(".okbtn").click();
        }, 1000 * options.hideAfter);
    }
}

function initWhiteboard() {
    $(document).ready(function () {
        // by default set in readOnly mode
        ReadOnlyService.activateReadOnlyMode();

        if (urlParams.get("webdav") === "true") {
            $("#uploadWebDavBtn").show();
        }

        whiteboard.loadWhiteboard("#whiteboardContainer", {
            //Load the whiteboard
            whiteboardId: whiteboardId,
            username: btoa(encodeURIComponent(myUsername)),
            backgroundGridUrl: "./images/" + ConfigService.backgroundGridImage,
            sendFunction: function (content) {
                if (ReadOnlyService.readOnlyActive) return;
                //ADD IN LATER THROUGH CONFIG
                // if (content.t === 'cursor') {
                //     if (whiteboard.drawFlag) return;
                // }
                content["at"] = accessToken;
                signaling_socket.emit("drawToWhiteboard", content);
                InfoService.incrementNbMessagesSent();
            },
        });

        ///////////////////////////////////////////////////////////////////
        // whiteboard.drawPenLine(100, 100, 109, 100, "black", 1);
        // whiteboard.drawPenLine(100, 120, 109.5, 120, "black", 1);

        // fs.readFile('../exp.inkml', 'utf-8', async (err, data) => {
        //     if (err) {
        //       console.error(err);
        //       return;
        //     }
        // const inkml = await parseStringPromise(data);
        // const traces = inkml.ink.trace;
        // for (const trace of traces) {
        //   const points = trace._.split(';').map(p => p.split(',').map(parseFloat));
        //   const xs = points.map(p => p[0]);
        //   const ys = points.map(p => p[1]);
        //   const minX = Math.min(...xs);
        //   const maxX = Math.max(...xs);
        //   const minY = Math.min(...ys);
        //   const maxY = Math.max(...ys);
        //   const width = maxX - minX;
        //   const height = maxY - minY;
        //   const scaleX = 800 / width;
        //   const scaleY = 800 / height;
        //   for (let i = 1; i < points.length; i++) {
        //     const [x1, y1] = points[i - 1];
        //     const [x2, y2] = points[i];
        //     const newX1 = (x1 - minX) * scaleX;
        //     const newY1 = (y1 - minY) * scaleY;
        //     const newX2 = (x2 - minX) * scaleX;
        //     const newY2 = (y2 - minY) * scaleY;
        //     whiteboard.drawPenLine(newX1, newY1, newX2, newY2, 'black', 3);
        //   }
        // }
        // });
        //////////////////////////////////////////////////////////////////

        // request whiteboard from server
        $.get(subdir + "/api/loadwhiteboard", { wid: whiteboardId, at: accessToken }).done(
            function (data) {
                console.log(data);
                whiteboard.loadData(data);
                if (copyfromwid && data.length == 0) {
                    //Copy from witheboard if current is empty and get parameter is given
                    $.get(subdir + "/api/loadwhiteboard", {
                        wid: copyfromwid,
                        at: accessToken,
                    }).done(function (data) {
                        whiteboard.loadData(data);
                    });
                }
            }
        );

        $(window).resize(function () {
            signaling_socket.emit("updateScreenResolution", {
                at: accessToken,
                windowWidthHeight: { w: $(window).width(), h: $(window).height() },
            });
        });

        /*----------------/
        Whiteboard actions
        /----------------*/

        var tempLineTool = false;
        var strgPressed = false;
        //Handle key actions
        $(document).on("keydown", function (e) {
            if (e.which == 16) {
                if (whiteboard.tool == "pen" && !strgPressed) {
                    tempLineTool = true;
                    whiteboard.ownCursor.hide();
                    if (whiteboard.drawFlag) {
                        whiteboard.mouseup({
                            offsetX: whiteboard.prevPos.x,
                            offsetY: whiteboard.prevPos.y,
                        });
                        shortcutFunctions.setTool_line();
                        whiteboard.mousedown({
                            offsetX: whiteboard.prevPos.x,
                            offsetY: whiteboard.prevPos.y,
                        });
                    } else {
                        shortcutFunctions.setTool_line();
                    }
                }
                whiteboard.pressedKeys["shift"] = true; //Used for straight lines...
            } else if (e.which == 17) {
                strgPressed = true;
            }
            //console.log(e.which);
        });
        $(document).on("keyup", function (e) {
            if (e.which == 16) {
                if (tempLineTool) {
                    tempLineTool = false;
                    shortcutFunctions.setTool_pen();
                    whiteboard.ownCursor.show();
                }
                whiteboard.pressedKeys["shift"] = false;
            } else if (e.which == 17) {
                strgPressed = false;
            }
        });

        //Load keybindings from keybinds.js to given functions
        Object.entries(keybinds).forEach(([key, functionName]) => {
            const associatedShortcutFunction = shortcutFunctions[functionName];
            if (associatedShortcutFunction) {
                keymage(key, associatedShortcutFunction, { preventDefault: true });
            } else {
                console.error(
                    "Function you want to keybind on key:",
                    key,
                    "named:",
                    functionName,
                    "is not available!"
                );
            }
        });

        // whiteboard clear button
        $("#whiteboardTrashBtn")
            .off("click")
            .click(function () {
                $("#whiteboardTrashBtnConfirm").show().focus();
                $(this).hide();
            });

        $("#whiteboardTrashBtnConfirm").mouseout(function () {
            $(this).hide();
            $("#whiteboardTrashBtn").show();
        });

        $("#whiteboardTrashBtnConfirm")
            .off("click")
            .click(function () {
                $(this).hide();
                $("#whiteboardTrashBtn").show();
                whiteboard.clearWhiteboard();
            });

        // undo button
        $("#whiteboardUndoBtn")
            .off("click")
            .click(function () {
                whiteboard.undoWhiteboardClick();
            });

        // redo button
        $("#whiteboardRedoBtn")
            .off("click")
            .click(function () {
                whiteboard.redoWhiteboardClick();
            });

        // view only
        $("#whiteboardLockBtn")
            .off("click")
            .click(() => {
                ReadOnlyService.deactivateReadOnlyMode();
            });
        $("#whiteboardUnlockBtn")
            .off("click")
            .click(() => {
                ReadOnlyService.activateReadOnlyMode();
            });
        $("#whiteboardUnlockBtn").hide();
        $("#whiteboardLockBtn").show();

        // switch tool
        $(".whiteboard-tool")
            .off("click")
            .click(function () {
                $(".whiteboard-tool").removeClass("active");
                $(this).addClass("active");
                var activeTool = $(this).attr("tool");
                whiteboard.setTool(activeTool);
                if (activeTool == "mouse" || activeTool == "recSelect") {
                    $(".activeToolIcon").empty();
                } else {
                    $(".activeToolIcon").html($(this).html()); //Set Active icon the same as the button icon
                }

                if (activeTool == "text" || activeTool == "stickynote") {
                    $("#textboxBackgroundColorPickerBtn").show();
                } else {
                    $("#textboxBackgroundColorPickerBtn").hide();
                }
                let savedThickness = localStorage.getItem("item_thickness_" + activeTool);
                if (savedThickness) {
                    whiteboard.setStrokeThickness(savedThickness);
                    $("#whiteboardThicknessSlider").val(savedThickness);
                }
            });

        // upload image button
        $("#addImgToCanvasBtn")
            .off("click")
            .click(function () {
                if (ReadOnlyService.readOnlyActive) return;
                showBasicAlert(`Please drag the image into the browser.<br>
                Or upload here: <input type="file" id="manualFileUpload" name="myfile" />`);
                document.getElementById("manualFileUpload").addEventListener(
                    "change",
                    function (e) {
                        $(".basicalert").remove();
                        if (ReadOnlyService.readOnlyActive) return;
                        e.originalEvent = { dataTransfer: { files: e.target.files } };
                        handleFileUploadEvent(e);
                    },
                    false
                );
            });

        // save image as imgae
        $("#saveAsImageBtn")
            .off("click")
            .click(function () {
                whiteboard.getImageDataBase64(
                    {
                        imageFormat: ConfigService.imageDownloadFormat,
                        drawBackgroundGrid: ConfigService.drawBackgroundGrid,
                    },
                    function (imgData) {
                        var w = window.open("about:blank"); //Firefox will not allow downloads without extra window
                        setTimeout(function () {
                            //FireFox seems to require a setTimeout for this to work.
                            var a = document.createElement("a");
                            a.href = imgData;
                            a.download = "whiteboard." + ConfigService.imageDownloadFormat;
                            w.document.body.appendChild(a);
                            a.click();
                            w.document.body.removeChild(a);
                            setTimeout(function () {
                                w.close();
                            }, 100);
                        }, 0);
                    }
                );
            });

        // save image to json containing steps
        $("#saveAsJSONBtn")
            .off("click")
            .click(function () {
                var imgData = whiteboard.getImageDataJson();

                var w = window.open("about:blank"); //Firefox will not allow downloads without extra window
                setTimeout(function () {
                    //FireFox seems to require a setTimeout for this to work.
                    var a = document.createElement("a");
                    a.href = window.URL.createObjectURL(new Blob([imgData], { type: "text/json" }));
                    a.download = "whiteboard.json";
                    w.document.body.appendChild(a);
                    a.click();
                    w.document.body.removeChild(a);
                    setTimeout(function () {
                        w.close();
                    }, 100);
                }, 0);
            });

        $("#uploadWebDavBtn")
            .off("click")
            .click(function () {
                if ($(".webdavUploadBtn").length > 0) {
                    return;
                }

                var webdavserver = localStorage.getItem("webdavserver") || "";
                var webdavpath = localStorage.getItem("webdavpath") || "/";
                var webdavusername = localStorage.getItem("webdavusername") || "";
                var webdavpassword = localStorage.getItem("webdavpassword") || "";
                var webDavHtml = $(
                    "<div>" +
                        "<table>" +
                        "<tr>" +
                        "<td>Server URL:</td>" +
                        '<td><input class="webdavserver" type="text" value="' +
                        webdavserver +
                        '" placeholder="https://yourserver.com/remote.php/webdav/"></td>' +
                        "<td></td>" +
                        "</tr>" +
                        "<tr>" +
                        "<td>Path:</td>" +
                        '<td><input class="webdavpath" type="text" placeholder="folder" value="' +
                        webdavpath +
                        '"></td>' +
                        '<td style="font-size: 0.7em;"><i>path always have to start & end with "/"</i></td>' +
                        "</tr>" +
                        "<tr>" +
                        "<td>Username:</td>" +
                        '<td><input class="webdavusername" type="text" value="' +
                        webdavusername +
                        '" placeholder="username"></td>' +
                        '<td style="font-size: 0.7em;"></td>' +
                        "</tr>" +
                        "<tr>" +
                        "<td>Password:</td>" +
                        '<td><input class="webdavpassword" type="password" value="' +
                        webdavpassword +
                        '" placeholder="password"></td>' +
                        '<td style="font-size: 0.7em;"></td>' +
                        "</tr>" +
                        "<tr>" +
                        '<td style="font-size: 0.7em;" colspan="3">Note: You have to generate and use app credentials if you have 2 Factor Auth activated on your dav/nextcloud server!</td>' +
                        "</tr>" +
                        "<tr>" +
                        "<td></td>" +
                        '<td colspan="2"><span class="loadingWebdavText" style="display:none;">Saving to webdav, please wait...</span><button class="modalBtn webdavUploadBtn"><i class="fas fa-upload"></i> Start Upload</button></td>' +
                        "</tr>" +
                        "</table>" +
                        "</div>"
                );
                webDavHtml
                    .find(".webdavUploadBtn")
                    .off("click")
                    .click(function () {
                        var webdavserver = webDavHtml.find(".webdavserver").val();
                        localStorage.setItem("webdavserver", webdavserver);
                        var webdavpath = webDavHtml.find(".webdavpath").val();
                        localStorage.setItem("webdavpath", webdavpath);
                        var webdavusername = webDavHtml.find(".webdavusername").val();
                        localStorage.setItem("webdavusername", webdavusername);
                        var webdavpassword = webDavHtml.find(".webdavpassword").val();
                        localStorage.setItem("webdavpassword", webdavpassword);
                        whiteboard.getImageDataBase64(
                            {
                                imageFormat: ConfigService.imageDownloadFormat,
                                drawBackgroundGrid: ConfigService.drawBackgroundGrid,
                            },
                            function (base64data) {
                                var webdavaccess = {
                                    webdavserver: webdavserver,
                                    webdavpath: webdavpath,
                                    webdavusername: webdavusername,
                                    webdavpassword: webdavpassword,
                                };
                                webDavHtml.find(".loadingWebdavText").show();
                                webDavHtml.find(".webdavUploadBtn").hide();
                                saveWhiteboardToWebdav(base64data, webdavaccess, function (err) {
                                    if (err) {
                                        webDavHtml.find(".loadingWebdavText").hide();
                                        webDavHtml.find(".webdavUploadBtn").show();
                                    } else {
                                        webDavHtml.parents(".basicalert").remove();
                                    }
                                });
                            }
                        );
                    });
                showBasicAlert(webDavHtml, {
                    header: "Save to Webdav",
                    okBtnText: "cancel",
                    headercolor: "#0082c9",
                });
                // render newly added icons
                dom.i2svg();
            });

        // upload json containing steps
        $("#uploadJsonBtn")
            .off("click")
            .click(function () {
                $("#myFile").click();
            });

        //////////////////////////////////////////////////
        $("#uploadInkmlBtn")
            .off("click")
            .click(function () {
                $("#myFileInkml").click();
            });
        /////////////////////////////////////////////////

        $("#shareWhiteboardBtn")
            .off("click")
            .click(() => {
                function urlToClipboard(whiteboardId = null) {
                    const { protocol, host, pathname, search } = window.location;
                    const basePath = `${protocol}//${host}${pathname}`;
                    const getParams = new URLSearchParams(search);

                    // Clear ursername from get parameters
                    getParams.delete("username");

                    if (whiteboardId) {
                        // override whiteboardId value in URL
                        getParams.set("whiteboardid", whiteboardId);
                    }

                    const url = `${basePath}?${getParams.toString()}`;
                    $("<textarea/>")
                        .appendTo("body")
                        .val(url)
                        .select()
                        .each(() => {
                            document.execCommand("copy");
                        })
                        .remove();
                }

                // UI related
                // clear message
                $("#shareWhiteboardDialogMessage").toggleClass("displayNone", true);

                $("#shareWhiteboardDialog").toggleClass("displayNone", false);
                $("#shareWhiteboardDialogGoBack")
                    .off("click")
                    .click(() => {
                        $("#shareWhiteboardDialog").toggleClass("displayNone", true);
                    });

                $("#shareWhiteboardDialogCopyReadOnlyLink")
                    .off("click")
                    .click(() => {
                        urlToClipboard(ConfigService.correspondingReadOnlyWid);

                        $("#shareWhiteboardDialogMessage")
                            .toggleClass("displayNone", false)
                            .text("Read-only link copied to clipboard ✓");
                    });

                $("#shareWhiteboardDialogCopyReadWriteLink")
                    .toggleClass("displayNone", ConfigService.isReadOnly)
                    .click(() => {
                        $("#shareWhiteboardDialogMessage")
                            .toggleClass("displayNone", false)
                            .text("Read/write link copied to clipboard ✓");
                        urlToClipboard();
                    });
            });

        $("#displayWhiteboardInfoBtn")
            .off("click")
            .click(() => {
                InfoService.toggleDisplayInfo();
            });

        var btnsMini = false;
        $("#minMaxBtn")
            .off("click")
            .click(function () {
                if (!btnsMini) {
                    $("#toolbar").find(".btn-group:not(.minGroup)").hide();
                    $(this).find("#minBtn").hide();
                    $(this).find("#maxBtn").show();
                } else {
                    $("#toolbar").find(".btn-group").show();
                    $(this).find("#minBtn").show();
                    $(this).find("#maxBtn").hide();
                }
                btnsMini = !btnsMini;
            });

        // load json to whiteboard
        $("#myFile").on("change", function () {
            var file = document.getElementById("myFile").files[0];
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var j = JSON.parse(e.target.result);
                    whiteboard.loadJsonData(j);
                } catch (e) {
                    showBasicAlert("File was not a valid JSON!");
                }
            };
            reader.readAsText(file);
            $(this).val("");
        });

        ///////////////////////////////////////////////////
        function parseMathml(mathml, result = []) {
            for (let child of mathml.children) {
                if (child.tagName == "mi" || child.tagName == "mo" || child.tagName == "mn") {
                    result.push([child.getAttribute("xml:id"), child.tagName]);
                } else if (child.tagName == "mrow") {
                    result = parseMathml(child, result);
                }
            }
            return result;
        }

        function getSymbolFromId(mathml, id) {
            for (let child of mathml.children) {
                if ((child.tagName == "mi" || child.tagName == "mo" || child.tagName == "mn") && child.getAttribute("xml:id") === id) {
                    return child.innerHTML;
                } else if (child.tagName == "mrow") {
                    let result = getSymbolFromId(child, id);
                    if (result !== undefined) {
                        return result;
                    }
                }
            }
        }

        $("#myFileInkml").on("change", function () {
            var file = document.getElementById("myFileInkml").files[0];
            var reader = new FileReader();

            reader.onload = function (e) {
                //try {
                    // let expression123 = new Expression();
                    // expression123.appendSymbol(new Symbol("a", 0, 'mi'));
                    // expression123.appendSymbol(new Symbol("+", 1, 'mo'));
                    // expression123.appendSymbol(new Symbol("b", 2, 'mi'));
                    // expression123.appendSymbol(new Symbol("*", 3, 'mo'));
                    // expression123.appendSymbol(new Symbol("c", 4, 'mi'));
                    // expression123.appendSymbol(new Symbol("=", 5, 'mo'));
                    // expression123.appendSymbol(new Symbol("d", 6, 'mi'));
                    // // expression.appendSymbol(new Symbol("*", 7, 'mo'));
                    // // expression.appendSymbol(new Symbol("e", 8, 'mi'));
                    // // expression.appendSymbol(new Symbol("+", 9, 'mo'));
                    // // expression.appendSymbol(new Symbol("f", 10, 'mi'));
                    // // expression.appendSymbol(new Symbol("=", 11, 'mo'));
                    // // expression.appendSymbol(new Symbol("g", 12, 'mi'));

                    // expression.appendSymbol(new Symbol("a", 0, 'mi'));
                    // expression.appendSymbol(new Symbol("+", 1, 'mo'));
                    // expression.appendSymbol(new Symbol("b", 2, 'mi'));
                    // expression.appendSymbol(new Symbol("=", 3, 'mo'));
                    // expression.appendSymbol(new Symbol("c", 4, 'mi'));

                    // let node123 = buildTree(expression123.symbols);
                    // expression123.setRootNode(buildParsedTree(node123, new RoseTreeNode(true)));

                    // console.log("ZAAAAAA");
                    // console.log(expression123);

                    // whiteboard.expression = expression;
                    // //console.log(whiteboard.expression);

                    // console.log(whiteboard.expandSelection(whiteboard.expression.rootNode.firstChild.firstChild.frontSibling, 2));
                    let expression = new Expression();
                    let parser = new DOMParser();
                    let xmlDoc = parser.parseFromString(e.target.result, "text/xml");
                    const traces = xmlDoc.getElementsByTagName("trace");
                    let traceGroups = xmlDoc.getElementsByTagName("traceGroup");
                    //traceGroups = traceGroups[0].getElementsByTagName("traceGroup");
                    let minX = 999999;
                    let maxX = -999999;
                    let minY = 999999;
                    let maxY = -999999;
                    for (let i = 0; i < traces.length; i++) {
                        let points = traces[i].innerHTML
                            .split(",")
                            .map((p) => p.trim().split(" ").map(parseFloat));
                        let tempMinX = Math.min(...points.map((p) => p[0]));
                        let tempMaxX = Math.max(...points.map((p) => p[0]));
                        let tempMinY = Math.min(...points.map((p) => p[1]));
                        let tempMaxY = Math.max(...points.map((p) => p[1]));
                        if (tempMinX < minX) minX = tempMinX;
                        if (tempMaxX > maxX) maxX = tempMaxX;
                        if (tempMinY < minY) minY = tempMinY;
                        if (tempMaxY > maxY) maxY = tempMaxY;
                    }
                    const meanX = (minX + maxX) / 2;
                    const meanY = (minY + maxY) / 2;
                    const originalWidth = meanX * 2;
                    const originalHeight = meanY * 2;
                    const scaleX = originalWidth / 1600;
                    const scaleY = originalHeight / 600;
                    //////////
                    let currentWidth = maxX - minX;
                    let currentHeight = maxY - minY;
                    let aspectRatio = currentWidth / currentHeight;
                    let desiredWidth = 500;
                    let desiredHeight = desiredWidth / aspectRatio; 
                    //////////
                    console.log("maxX: ");
                    console.log(maxX);
                    console.log(xmlDoc.getElementsByTagName("mrow")[0]);
                    let ids = parseMathml(xmlDoc.getElementsByTagName("mrow")[0]);
                    console.log("IDSSSSSSSSSS");
                    console.log(ids);
                    console.log(traceGroups);

                    for (let id of ids) {
                        for (let traceGroup of traceGroups) {
                            let annotationXML = traceGroup.getElementsByTagName("annotationXML")[0];
                            let annotation = traceGroup.getElementsByTagName("annotation")[0];
                            if (((annotationXML && annotationXML.parentNode === traceGroup && id[0] == annotationXML.getAttribute("href")) || (annotation && annotation.parentNode === traceGroup && id[0] == annotation.textContent))) {
                                let content = [];
                                let newSymbol = new Symbol(
                                    getSymbolFromId(xmlDoc.querySelector('mrow'), id[0]),
                                    whiteboard.drawId,
                                    id[1]
                                );
                                expression.appendSymbol(newSymbol);
                                for (let traceView of traceGroup.getElementsByTagName(
                                    "traceView"
                                )) {
                                    for (let trace of traces) {
                                        if (
                                            trace.getAttribute("id") ==
                                            traceView.getAttribute("traceDataRef")
                                        ) {
                                            let points = trace.innerHTML
                                                .split(",")
                                                .map((p) => p.trim().split(" ").map(parseFloat));
                                            for (let i = 1; i < points.length; i++) {
                                                // const x1 = points[i - 1][0] / scaleX;
                                                // const y1 = points[i - 1][1] / scaleY;
                                                // const newX1 = points[i][0] / scaleX;
                                                // const newY1 = points[i][1] / scaleY;
                                                // const x1 = points[i - 1][0];
                                                // const y1 = points[i - 1][1];
                                                // const newX1 = points[i][0];
                                                // const newY1 = points[i][1];
                                                const x1 = (points[i - 1][0] / currentWidth) * desiredWidth + 200;
                                                const y1 = (points[i - 1][1] / currentHeight) * desiredHeight + 200;
                                                const newX1 = (points[i][0] / currentWidth) * desiredWidth + 200;
                                                const newY1 = (points[i][1] / currentHeight) * desiredHeight + 200;
                                                let newContent = {};
                                                newContent["t"] = "pen";
                                                newContent["d"] = [x1, y1, newX1, newY1];
                                                newContent["c"] = "black";
                                                newContent["username"] =
                                                    whiteboard.settings.username;
                                                newContent["th"] = 3;
                                                newContent["tagName"] = id[1];
                                                newContent["symbol"] = getSymbolFromId(xmlDoc.querySelector('mrow'), id[0]);
                                                //console.log(traceGroup);
                                                content.push(newContent);
                                            }
                                        }
                                    }
                                }
                                whiteboard.loadDataInSteps(
                                    content,
                                    true,
                                    function (stepData, index) {
                                        if (index >= content.length - 1) {
                                            //Done with all data
                                            whiteboard.drawId++;
                                        }
                                    }
                                );
                            }
                        }
                    }

                    console.log("SYMBOLSS");
                    console.log(expression.symbols);
                    let node = buildTree(expression.symbols);
                    console.log("NODE");
                    console.log(node);
                    expression.setRootNode(buildParsedTree(node, new RoseTreeNode(true)));

                    whiteboard.expressions.push(expression);
                    console.log(expression);

                    // parseString(e.target.result, function(err, result) {
                    //     const traces = result.ink.trace;
                    //     const traceGroups = result.ink.traceGroup[0].traceGroup;
                    //     let minX = 999999;
                    //     let maxX = -999999;
                    //     let minY = 999999;
                    //     let maxY = -999999;
                    //     for (let i = 0; i < traces.length; i++)
                    //     {
                    //         let points = traces[i]._.split(',').map(p => p.trim().split(' ').map(parseFloat));
                    //         let tempMinX = Math.min(...points.map(p => p[0]));
                    //         let tempMaxX = Math.max(...points.map(p => p[0]));
                    //         let tempMinY = Math.min(...points.map(p => p[1]));
                    //         let tempMaxY = Math.max(...points.map(p => p[1]));
                    //         if (tempMinX < minX)
                    //             minX = tempMinX;
                    //         if (tempMaxX > maxX)
                    //             maxX = tempMaxX;
                    //         if (tempMinY < minY)
                    //             minY = tempMinY;
                    //         if (tempMaxY > maxY)
                    //             maxY = tempMaxY;
                    //     }
                    //     const meanX = (minX + maxX) / 2;
                    //     const meanY = (minY + maxY) / 2;
                    //     const originalWidth = meanX * 2;
                    //     const originalHeight = meanY * 2;
                    //     const scaleX = originalWidth / 1600;
                    //     const scaleY = originalHeight / 600;

                    // for (let m = 0; m < traceGroups.length; m++)
                    // {
                    //     let content = [];
                    //     for (let t = 0; t < traceGroups[m].traceView.length; t++)
                    //     {
                    //         for (let n = 0; n < traces.length; n++) {
                    //             if (traces[n].$.id === traceGroups[m].traceView[t].$.traceDataRef)
                    //             {
                    //                 let points = traces[n]._.split(',').map(p => p.trim().split(' ').map(parseFloat));
                    //                 for (let i = 1; i < points.length; i++) {
                    //                     const x1 = points[i-1][0] / scaleX;
                    //                     const y1 = points[i-1][1] / scaleY;
                    //                     const newX1 = points[i][0] / scaleX;
                    //                     const newY1 = points[i][1] / scaleY;
                    //                     let newContent = {};
                    //                     newContent["t"] = "pen";
                    //                     newContent["d"] = [x1, y1, newX1, newY1];
                    //                     newContent["c"] = "black";
                    //                     newContent["username"] = whiteboard.settings.username;
                    //                     newContent["th"] = 3;
                    //                     console.log(traceGroups[m]);
                    //                     content.push(newContent);
                    //                 }
                    //             }
                    //         }
                    //     }
                    //     whiteboard.loadDataInSteps(content, true, function (stepData, index) {
                    //         if (index >= content.length - 1) {
                    //             //Done with all data
                    //             whiteboard.drawId++;
                    //         }
                    //     });
                    // }
                    //});
                // } catch (e) {
                //     showBasicAlert("File was not a valid Inkml!");
                // }
            };
            reader.readAsText(file);
            whiteboard.canvas.height = whiteboard.canvas.height;
            whiteboard.imgContainer.empty();
            whiteboard.loadDataInSteps(whiteboard.drawBuffer, false, function (stepData) {
                //Nothing to do
            });
            $(this).val("");
        });
        //////////////////////////////////////////////////

        // On thickness slider change
        $("#whiteboardThicknessSlider").on("input", function () {
            if (ReadOnlyService.readOnlyActive) return;
            whiteboard.setStrokeThickness($(this).val());
            let activeTool = $(".whiteboard-tool.active").attr("tool");
            localStorage.setItem("item_thickness_" + activeTool, $(this).val());
        });

        let activeTool = $(".whiteboard-tool.active").attr("tool");
        let savedThickness = localStorage.getItem("item_thickness_" + activeTool);
        if (savedThickness) {
            whiteboard.setStrokeThickness(savedThickness);
            $("#whiteboardThicknessSlider").val(savedThickness);
        }

        // handle drag&drop
        var dragCounter = 0;
        $("#whiteboardContainer").on("dragenter", function (e) {
            if (ReadOnlyService.readOnlyActive) return;
            e.preventDefault();
            e.stopPropagation();
            dragCounter++;
            whiteboard.dropIndicator.show();
        });

        $("#whiteboardContainer").on("dragleave", function (e) {
            if (ReadOnlyService.readOnlyActive) return;

            e.preventDefault();
            e.stopPropagation();
            dragCounter--;
            if (dragCounter === 0) {
                whiteboard.dropIndicator.hide();
            }
        });

        function handleFileUploadEvent(e) {
            console.log(e);
            if (e.originalEvent.dataTransfer) {
                if (e.originalEvent.dataTransfer.files.length) {
                    //File from harddisc
                    e.preventDefault();
                    e.stopPropagation();
                    var filename = e.originalEvent.dataTransfer.files[0]["name"];
                    if (isImageFileName(filename)) {
                        var blob = e.originalEvent.dataTransfer.files[0];
                        var reader = new window.FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = function () {
                            const base64data = reader.result;
                            uploadImgAndAddToWhiteboard(base64data);
                        };
                    } else if (isPDFFileName(filename)) {
                        //Handle PDF Files
                        var blob = e.originalEvent.dataTransfer.files[0];

                        var reader = new window.FileReader();
                        reader.onloadend = function () {
                            var pdfData = new Uint8Array(this.result);

                            var loadingTask = pdfjsLib.getDocument({ data: pdfData });
                            loadingTask.promise.then(
                                function (pdf) {
                                    console.log("PDF loaded");

                                    var currentDataUrl = null;
                                    var modalDiv = $(
                                        "<div>" +
                                            "Page: <select></select> " +
                                            '<button style="margin-bottom: 3px;" class="modalBtn"><i class="fas fa-upload"></i> Upload to Whiteboard</button>' +
                                            '<img style="width:100%;" src=""/>' +
                                            "</div>"
                                    );

                                    modalDiv.find("select").change(function () {
                                        showPDFPageAsImage(parseInt($(this).val()));
                                    });

                                    modalDiv
                                        .find("button")
                                        .off("click")
                                        .click(function () {
                                            if (currentDataUrl) {
                                                $(".basicalert").remove();
                                                uploadImgAndAddToWhiteboard(currentDataUrl);
                                            }
                                        });

                                    for (var i = 1; i < pdf.numPages + 1; i++) {
                                        modalDiv
                                            .find("select")
                                            .append('<option value="' + i + '">' + i + "</option>");
                                    }

                                    showBasicAlert(modalDiv, {
                                        header: "Pdf to Image",
                                        okBtnText: "cancel",
                                        headercolor: "#0082c9",
                                    });

                                    // render newly added icons
                                    dom.i2svg();

                                    showPDFPageAsImage(1);
                                    function showPDFPageAsImage(pageNumber) {
                                        // Fetch the page
                                        pdf.getPage(pageNumber).then(function (page) {
                                            console.log("Page loaded");

                                            var scale = 1.5;
                                            var viewport = page.getViewport({ scale: scale });

                                            // Prepare canvas using PDF page dimensions
                                            var canvas = $("<canvas></canvas>")[0];
                                            var context = canvas.getContext("2d");
                                            canvas.height = viewport.height;
                                            canvas.width = viewport.width;

                                            // Render PDF page into canvas context
                                            var renderContext = {
                                                canvasContext: context,
                                                viewport: viewport,
                                            };
                                            var renderTask = page.render(renderContext);
                                            renderTask.promise.then(function () {
                                                var dataUrl = canvas.toDataURL("image/jpeg", 1.0);
                                                currentDataUrl = dataUrl;
                                                modalDiv.find("img").attr("src", dataUrl);
                                                console.log("Page rendered");
                                            });
                                        });
                                    }
                                },
                                function (reason) {
                                    // PDF loading error

                                    showBasicAlert(
                                        "Error loading pdf as image! Check that this is a vaild pdf file!"
                                    );
                                    console.error(reason);
                                }
                            );
                        };
                        reader.readAsArrayBuffer(blob);
                    } else {
                        showBasicAlert("File must be an image!");
                    }
                } else {
                    //File from other browser

                    var fileUrl = e.originalEvent.dataTransfer.getData("URL");
                    var imageUrl = e.originalEvent.dataTransfer.getData("text/html");
                    var rex = /src="?([^"\s]+)"?\s*/;
                    var url = rex.exec(imageUrl);
                    if (url && url.length > 1) {
                        url = url[1];
                    } else {
                        url = "";
                    }

                    isValidImageUrl(fileUrl, function (isImage) {
                        if (isImage && isImageFileName(url)) {
                            whiteboard.addImgToCanvasByUrl(fileUrl);
                        } else {
                            isValidImageUrl(url, function (isImage) {
                                if (isImage) {
                                    if (isImageFileName(url) || url.startsWith("http")) {
                                        whiteboard.addImgToCanvasByUrl(url);
                                    } else {
                                        uploadImgAndAddToWhiteboard(url); //Last option maybe its base64
                                    }
                                } else {
                                    showBasicAlert("Can only upload Imagedata!");
                                }
                            });
                        }
                    });
                }
            }
        }

        $("#whiteboardContainer").on("drop", function (e) {
            //Handle drop
            if (ReadOnlyService.readOnlyActive) return;

            handleFileUploadEvent(e);
            dragCounter = 0;
            whiteboard.dropIndicator.hide();
        });

        if (!localStorage.getItem("savedColors")) {
            localStorage.setItem(
                "savedColors",
                JSON.stringify([
                    "rgba(0, 0, 0, 1)",
                    "rgba(255, 255, 255, 1)",
                    "rgba(255, 0, 0, 1)",
                    "rgba(0, 255, 0, 1)",
                    "rgba(0, 0, 255, 1)",
                    "rgba(255, 255, 0, 1)",
                    "rgba(255, 0, 255, 1)",
                ])
            );
        }

        let colorPickerOnOpen = function (current_color) {
            this._domPalette = $(".picker_palette", this.domElement);
            const palette = JSON.parse(localStorage.getItem("savedColors"));
            if ($(".picker_splotch", this._domPalette).length === 0) {
                for (let i = 0; i < palette.length; i++) {
                    let palette_Color_obj = new this.color.constructor(palette[i]);
                    let splotch_div = $(
                        '<div style="position:relative;"><span position="' +
                            i +
                            '" class="removeColor" style="position:absolute; cursor:pointer; right:-1px; top:-4px;">x</span></div>'
                    )
                        .addClass("picker_splotch")
                        .attr({
                            id: "s" + i,
                        })
                        .css("background-color", palette_Color_obj.hslaString)
                        .on("click", { that: this, obj: palette_Color_obj }, function (e) {
                            e.data.that._setColor(e.data.obj.hslaString);
                        });
                    splotch_div.find(".removeColor").on("click", function (e) {
                        e.preventDefault();
                        $(this).parent("div").remove();
                        palette.splice(i, 1);
                        localStorage.setItem("savedColors", JSON.stringify(palette));
                    });
                    this._domPalette.append(splotch_div);
                }
            }
        };

        const colorPickerTemplate = `
        <div class="picker_wrapper" tabindex="-1">
          <div class="picker_arrow"></div>
          <div class="picker_hue picker_slider">
            <div class="picker_selector"></div>
          </div>
          <div class="picker_sl">
            <div class="picker_selector"></div>
          </div>
          <div class="picker_alpha picker_slider">
            <div class="picker_selector"></div>
          </div>
          <div class="picker_palette"></div>
          <div class="picker_editor">
            <input aria-label="Type a color name or hex value"/>
          </div>
          <div class="picker_sample"></div>
          <div class="picker_done">
            <button>Ok</button>
          </div>
          <div class="picker_cancel">
            <button>Cancel</button>
          </div>
        </div>
      `;

        let colorPicker = null;
        function intColorPicker(initColor) {
            if (colorPicker) {
                colorPicker.destroy();
            }
            colorPicker = new Picker({
                parent: $("#whiteboardColorpicker")[0],
                color: initColor || "#000000",
                onChange: function (color) {
                    whiteboard.setDrawColor(color.rgbaString);
                },
                onDone: function (color) {
                    let palette = JSON.parse(localStorage.getItem("savedColors"));
                    if (!palette.includes(color.rgbaString)) {
                        palette.push(color.rgbaString);
                        localStorage.setItem("savedColors", JSON.stringify(palette));
                    }
                    intColorPicker(color.rgbaString);
                },
                onOpen: colorPickerOnOpen,
                template: colorPickerTemplate,
            });
        }
        intColorPicker();

        let bgColorPicker = null;
        function intBgColorPicker(initColor) {
            if (bgColorPicker) {
                bgColorPicker.destroy();
            }
            bgColorPicker = new Picker({
                parent: $("#textboxBackgroundColorPicker")[0],
                color: initColor || "#f5f587",
                bgcolor: initColor || "#f5f587",
                onChange: function (bgcolor) {
                    whiteboard.setTextBackgroundColor(bgcolor.rgbaString);
                },
                onDone: function (bgcolor) {
                    let palette = JSON.parse(localStorage.getItem("savedColors"));
                    if (!palette.includes(color.rgbaString)) {
                        palette.push(color.rgbaString);
                        localStorage.setItem("savedColors", JSON.stringify(palette));
                    }
                    intBgColorPicker(color.rgbaString);
                },
                onOpen: colorPickerOnOpen,
                template: colorPickerTemplate,
            });
        }
        intBgColorPicker();

        // on startup select mouse
        shortcutFunctions.setTool_mouse();
        // fix bug cursor not showing up
        whiteboard.refreshCursorAppearance();

        if (process.env.NODE_ENV === "production") {
            if (ConfigService.readOnlyOnWhiteboardLoad) ReadOnlyService.activateReadOnlyMode();
            else ReadOnlyService.deactivateReadOnlyMode();

            if (ConfigService.displayInfoOnWhiteboardLoad) InfoService.displayInfo();
            else InfoService.hideInfo();
        } else {
            // in dev
            ReadOnlyService.deactivateReadOnlyMode();
            InfoService.displayInfo();
        }

        // In any case, if we are on read-only whiteboard we activate read-only mode
        if (ConfigService.isReadOnly) ReadOnlyService.activateReadOnlyMode();

        $("body").show();
    });

    //Prevent site from changing tab on drag&drop
    window.addEventListener(
        "dragover",
        function (e) {
            e = e || event;
            e.preventDefault();
        },
        false
    );
    window.addEventListener(
        "drop",
        function (e) {
            e = e || event;
            e.preventDefault();
        },
        false
    );

    function uploadImgAndAddToWhiteboard(base64data) {
        const date = +new Date();
        $.ajax({
            type: "POST",
            url: document.URL.substr(0, document.URL.lastIndexOf("/")) + "/api/upload",
            data: {
                imagedata: base64data,
                wid: whiteboardId,
                date: date,
                at: accessToken,
            },
            success: function (msg) {
                const { correspondingReadOnlyWid } = ConfigService;
                const filename = `${correspondingReadOnlyWid}_${date}.png`;
                const rootUrl = document.URL.substr(0, document.URL.lastIndexOf("/"));
                whiteboard.addImgToCanvasByUrl(
                    `${rootUrl}/uploads/${correspondingReadOnlyWid}/${filename}`
                ); //Add image to canvas
                console.log("Image uploaded!");
            },
            error: function (err) {
                showBasicAlert("Failed to upload frame: " + JSON.stringify(err));
            },
        });
    }

    function saveWhiteboardToWebdav(base64data, webdavaccess, callback) {
        var date = +new Date();
        $.ajax({
            type: "POST",
            url: document.URL.substr(0, document.URL.lastIndexOf("/")) + "/api/upload",
            data: {
                imagedata: base64data,
                wid: whiteboardId,
                date: date,
                at: accessToken,
                webdavaccess: JSON.stringify(webdavaccess),
            },
            success: function (msg) {
                showBasicAlert("Whiteboard was saved to Webdav!", {
                    headercolor: "#5c9e5c",
                });
                console.log("Image uploaded to webdav!");
                callback();
            },
            error: function (err) {
                console.error(err);
                if (err.status == 403) {
                    showBasicAlert(
                        "Could not connect to Webdav folder! Please check the credentials and paths and try again!"
                    );
                } else {
                    showBasicAlert("Unknown Webdav error! ", err);
                }
                callback(err);
            },
        });
    }

    // verify if filename refers to an image
    function isImageFileName(filename) {
        var extension = filename.split(".")[filename.split(".").length - 1];
        var known_extensions = ["png", "jpg", "jpeg", "gif", "tiff", "bmp", "webp"];
        return known_extensions.includes(extension.toLowerCase());
    }

    // verify if filename refers to an pdf
    function isPDFFileName(filename) {
        var extension = filename.split(".")[filename.split(".").length - 1];
        var known_extensions = ["pdf"];
        return known_extensions.includes(extension.toLowerCase());
    }

    // verify if given url is url to an image
    function isValidImageUrl(url, callback) {
        var img = new Image();
        var timer = null;
        img.onerror = img.onabort = function () {
            clearTimeout(timer);
            callback(false);
        };
        img.onload = function () {
            clearTimeout(timer);
            callback(true);
        };
        timer = setTimeout(function () {
            callback(false);
        }, 2000);
        img.src = url;
    }

    // handle pasting from clipboard
    window.addEventListener("paste", function (e) {
        if ($(".basicalert").length > 0 || !!e.origin) {
            return;
        }
        if (e.clipboardData) {
            var items = e.clipboardData.items;
            var imgItemFound = false;
            if (items) {
                // Loop through all items, looking for any kind of image
                for (var i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf("image") !== -1) {
                        imgItemFound = true;
                        // We need to represent the image as a file,
                        var blob = items[i].getAsFile();

                        var reader = new window.FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = function () {
                            console.log("Uploading image!");
                            let base64data = reader.result;
                            uploadImgAndAddToWhiteboard(base64data);
                        };
                    }
                }
            }

            if (!imgItemFound && whiteboard.tool != "text" && whiteboard.tool != "stickynote") {
                showBasicAlert(
                    "Please Drag&Drop the image or pdf into the Whiteboard. (Browsers don't allow copy+past from the filesystem directly)"
                );
            }
        }
    });
}

export default main;
