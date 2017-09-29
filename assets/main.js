(function() {
    var contract_name = document.getElementById('contract_name'),
        contract_address = document.getElementById('contract_address'),
        contract_abi = document.getElementById('contract_abi'),
        createBtn = document.getElementById('create'),
        clearBtn = document.getElementById('clear'),
        downloadBtn = document.getElementById('download');

    createBtn.addEventListener('click', function() {
        var contractName = contract_name.value;
        var contractAddress = contract_address.value;
        var contractAbi = JSON.parse(contract_abi.value);

        var abi = new ABI(contractName, contractAddress, contractAbi);

        var format = 'ts';

        var abiFile = abiToFile(abi, formats[format]);
        downloadBtn.href = abiFile.url;
        downloadBtn.download = contractName + '.' + format;

        setOutput(abiFile.text);
    }, false);

    clearBtn.addEventListener('click', function() {
        contract_name.value = '';
        contract_address.value = '';
        contract_abi.value = '';
        downloadBtn.href = "#";
        downloadBtn.download = '';

        setOutput('Output');
    }, false);

    function setOutput(output) {
        document.getElementById('output').innerHTML = output;
        window.prettyPrint();
    }
})();


var currentFile = null;

function abiToFile(abi, outputFormat) {
    var parser = new outputFormat.parser(abi);
    var text = parser.Run();

    var data = new Blob([text], { type: outputFormat.format });

    // If we are replacing a previously generated file we need to
    // manually revoke the object URL to avoid memory leaks.
    if (currentFile !== null) {
        window.URL.revokeObjectURL(currentFile);
    }

    currentFile = window.URL.createObjectURL(data);

    return new ABIFile(currentFile, text);
}

var ABI = function(name, address, abiArray) {
    this.ABIArray = JSON.parse(JSON.stringify(abiArray));
    this.contractName = name;
    this.contractAddress = address;
    this.contractConstructor = null;
    this.contractMethods = [];
    this.contractEvents = [];

    for (var i = 0; i < abiArray.length; i++) {
        var element = abiArray[i];
        if (element.type === 'constructor') {
            this.contractConstructor = element;
        } else if (element.type === 'function') {
            this.contractMethods.push(element);
        } else if (element.type === 'event') {
            this.contractEvents.push(element);
        } else {
            console.log('ABI element lost: ' + JSON.stringify(element));
        }
    }
};

var ABIParser = function(abi) {
    // a value from formats (ex: formats.ts)
    this.format = '';

    this.abi = abi;
    this.currentIndent = 0;
    this.output = '';
    this.runned = false;
};

ABIParser.prototype.getInputType = function(input) {
    var type = input.type;

    var isArray = type.indexOf("[]") >= 0;
    if (isArray)
        type = type.replace("[]", "");

    if (type in this.format.types)
        type = this.format.types[type];

    if (isArray)
        type += "[]";

    return type;
};

ABIParser.prototype.appendIndent = function() {
    for (var i = 0; i < this.currentIndent; i++) {
        this.output += "\t";
    }
};

ABIParser.prototype.appendNewline = function() {
    this.output += "\r\n";
    this.appendIndent();
};

ABIParser.prototype.openBrackets = function() {
    this.output += " {";
    this.currentIndent++;

    this.appendNewline();
};

ABIParser.prototype.closeBrackets = function() {
    if (this.output[this.output.length - 1] === '\t')
        this.output = this.output.substring(0, this.output.length - 1)

    this.output += "}";
    this.currentIndent--;

    this.appendNewline();
};

ABIParser.prototype.Run = function() {
    // subclasses need to override this method
    if (this.runned)
        return this.output;
    this.output = "Not implemented";
    this.runned = true;
    return this.output;
};


var ABIToTs = function(abi) {
    ABIParser.call(this, abi);
    this.format = formats.ts;
};

ABIToTs.prototype = Object.create(ABIParser.prototype);

ABIToTs.prototype.constructor = ABIParser;

ABIToTs.prototype.appendInput = function(input, inputIndex, appendComma) {
    var name = input.name;
    name = input.name ? input.name : input.type + '_' + inputIndex;

    this.output += name + ': ' + this.getInputType(input);
    appendComma && (this.output += ', ');
};

ABIToTs.prototype.appendOutputTypes = function(outputs) {
    var out = null;
    if (outputs.length === 1) {
        out = outputs[0];
        this.output += 'Observable< ';
        (out.name) && (this.output += out.name + ' : ');
        this.output += this.getInputType(out) + ' >';
    } else {
        this.output += 'Observable<{ ';
        for (i = 0; i < outputs.length; i++) {
            out = outputs[i];
            (out.name) && (this.output += out.name + ' : ');
            this.output += this.getInputType(out);
            i + 1 < outputs.length && (this.output += ', ');
        }
        this.output += ' }>';
    }
};

ABIToTs.prototype.appendDocs = function(method, title) {
    var i, input;
    this.output += '/**';
    this.appendNewline();
    this.output += ' * ' + method.name + ' ' + title;
    this.appendNewline();
    for (i = 0; i < method.inputs.length; i++) {
        input = method.inputs[i];
        this.output += ' * @param {' + this.getInputType(input) + '} ' + input.name;
        this.appendNewline();
    }
    if (method.outputs && method.outputs.length) {
        this.output += ' * @returns {';
        this.appendOutputTypes(method.outputs);
        this.output += '}';
        this.appendNewline();
    }
    this.output += ' */';
    this.appendNewline();
};

ABIToTs.prototype.appendConstructor = function(method) {
    method.name = this.abi.contractName;
    method.inputs.unshift({ 'name': 'blockchainService', 'type': 'BlockchainService' });

    this.appendDocs(method, 'constructor');
    this.output += 'constructor (';
    if (method.inputs && method.inputs.length) {
        for (i = 0; i < method.inputs.length; i++) {
            this.output += 'private ';
            this.appendInput(method.inputs[i], i, i + 1 < method.inputs.length);
        }
    }
    this.output += ')';
    this.openBrackets();
    this.closeBrackets();
    this.appendNewline();
};

ABIToTs.prototype.appendMethod = function(method) {
    var originalName = method.name;
    method.name = method.name.charAt(0).toLowerCase() + method.name.slice(1);

    this.appendDocs(method, 'function');
    this.output += method.name + ' (';
    if (method.inputs && method.inputs.length) {
        for (i = 0; i < method.inputs.length; i++) {
            this.appendInput(method.inputs[i], i, i + 1 < method.inputs.length);
        }
    }
    this.output += ')';
    if (method.outputs && method.outputs.length) {
        this.output += ' : ';
        this.appendOutputTypes(method.outputs, true);
    }
    this.openBrackets();
    this.output += 'return this.blockchainService.executeMethod(this, \'' + originalName + '\'';
    if (method.inputs && method.inputs.length) {
        this.output += ', ';
        if (method.inputs.length === 1) {
            this.output += method.inputs[0].name;
        } else {
            this.output += '{ ';
            for (i = 0; i < method.inputs.length; i++) {
                this.output += method.inputs[i].name;
                i + 1 < method.inputs.length && (this.output += ', ');
            }
            this.output += ' }';
        }
    }
    this.output += ');';
    this.appendNewline();
    this.closeBrackets();
    this.appendNewline();
};

ABIToTs.prototype.appendEvent = function(method) {
    var originalName = method.name;
    method.name = 'on' + method.name.charAt(0).toUpperCase() + method.name.slice(1);

    this.appendDocs(method, 'event');
    this.output += method.name + ' (';
    if (method.inputs && method.inputs.length) {
        for (i = 0; i < method.inputs.length; i++) {
            this.appendInput(method.inputs[i], i, i + 1 < method.inputs.length);
        }
    }
    this.output += ')';
    if (method.outputs && method.outputs.length) {
        this.output += ' : ';
        this.appendOutputTypes(method.outputs);
    }
    this.openBrackets();
    this.output += 'return this.blockchainService.watch(this, \'' + originalName + '\');';
    this.appendNewline();
    this.closeBrackets();
    this.appendNewline();
};


ABIToTs.prototype.Run = function() {
    if (this.runned)
        return this.output;

    var m;

    this.output = '';

    this.output += 'import { IContract } from \'./abstract/icontract\';';
    this.appendNewline();
    this.output += 'import { BlockchainService } from \'../services/blockchain\';';
    this.appendNewline();
    this.output += 'import { Observable } from \'rxjs/Observable\';';
    this.appendNewline();
    this.appendNewline();

    this.output += '@Injectable()';
    this.output += 'export class ' + this.abi.contractName + ' implements IContract';
    this.openBrackets();
    this.appendNewline();
    this.output += 'IBArray = ' + JSON.stringify(this.abi.ABIArray) + ';';
    this.appendNewline();
    this.output += 'Address = ' + this.abi.contractAddress + ';';
    this.appendNewline();
    this.appendNewline();

    if (this.abi.contractConstructor !== null) {
        this.appendConstructor(this.abi.contractConstructor);
    } else {
        this.appendConstructor({ 'name': '', 'inputs': [] });
    }

    for (m = 0; m < this.abi.contractMethods.length; m++) {
        this.appendMethod(this.abi.contractMethods[m]);
    }

    for (m = 0; m < this.abi.contractEvents.length; m++) {
        this.appendEvent(this.abi.contractEvents[m]);
    }

    this.closeBrackets();

    this.runned = true;
    return this.output;
};

var ABIFile = function(url, text) {
    this.url = url;
    this.text = text;
};

var defaultObjectTypes = {
    'bool': '',
    'address': '',
    'string': '',
    'int': '',
    'uint': ''
};
for (var i = 8; i <= 256; i += 8) {
    defaultObjectTypes['int' + i] = '';
    defaultObjectTypes['uint' + i] = '';
}

var formats = {
    'ts': { 'format': 'text/typescript', 'parser': ABIToTs, 'types': Object.create(defaultObjectTypes) }
};
formats.ts.types = {
    'bool': 'boolean',
    'address': 'string',
    'string': 'string',
    'int': 'number',
    'uint': 'number'
};
for (var i = 8; i <= 256; i += 8) {
    formats.ts.types['int' + i] = 'number';
    formats.ts.types['uint' + i] = 'number';
}