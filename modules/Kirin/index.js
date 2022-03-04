const { SafeInteract } = require('../../scripts/safeActions');
const makeConfig = require('../../scripts/makeConfig');
const util = require('fallout-utility');
const yml = require('yaml');
const fs = require('fs');
const Server = require('./class/Server');
const Discord = require('discord.js');

module.exports = class Kirin {
    /**
     * 
     * @param {Discord.Client} Client 
     */
    constructor (Client, minecraftProtocol = require('minecraft-protocol'), shelljs = require('shelljs')) {
        this.Client = Client;
        this.logger = Client.AxisUtility.logger;
        this.rootDir = './config/kirin';
        this.minecraftProtocol = minecraftProtocol;
        this.shelljs = shelljs;
        this.config = this.getConfig();
        this.servers = this.getServers();
        this.commands = this.getCommands();
    }

    getCommands() {
        const commandsFolder = fs.readdirSync(`./${this.Client.AxisUtility.config.modulesFolder}/Kirin/commands/`, 'utf8').filter(file => file.endsWith('.js'));

        return commandsFolder.map(file => {
            try {
                return require(`./commands/${file}`)(this).command;
            } catch (error) {
                this.logger.error(error, 'Kirin');
            }
        });
    }

    getConfig() {
        const config = fs.readFileSync(`./${this.Client.AxisUtility.config.modulesFolder}/Kirin/templates/config.yml`, 'utf8');

        return yml.parse(makeConfig(`${this.rootDir}/config.yml`, util.replaceAll(config, '{rootDir}', this.rootDir)));
    }

    getServers() {
        if (!this.config?.serverListFile) throw new Error('No serverLists found in config.yml');

        const serversHeader = fs.readFileSync(`./${this.Client.AxisUtility.config.modulesFolder}/Kirin/templates/serverlist.yml`, 'utf8');
        const servers = yml.parse(makeConfig(this.config.serverListFile, `${serversHeader}\n${yml.stringify({ servers: [] })}`));

        return servers.servers.map(_server => {
            const server = new Server(this, _server.serverId, _server.startScript,  _server.startScriptPath, _server.host, _server.port, _server.message);
            
            server.guildId = _server.guildId;
            server.channelId = _server.channelId;
            server.messageId = _server.messageId;

            return server;
        });
    }

    async parseServers() {
        for (const server of this.servers) {
            await server.parse(server.guildId, server.channelId, server.messageId);
            await server.refreshMessage();
        }

        process.on('exit', () => {
            for (const server of this.servers) {
                if (!server.scriptProcess) return;
                if (this.config.killOnStop) {
                    server.scriptProcess.kill('SIGINT');
                }

                server.scriptProcess.disconnect();
                server.scriptProcess = null;
            }
        })
    }

    listenInteractions() {
        this.Client.on('interactionCreate',
            /**
             * 
             * @param {Discord.ButtonInteraction} interaction 
             */
            async interaction => {
                const serverId = interaction.customId.split('_')[0];
                const serverAction = interaction.customId.split('_')[1];

                const server = this.servers.find(srv => srv.interactionId === serverId);
                if (!server || !server?.isActive || !server.interactionFilter(interaction)) return;
                
                switch (serverAction) {
                    case 'start':
                        if ((interaction.memberPermissions && this.config.serverStartPermissions.lenght) && !interaction.memberPermissions.has(this.config.serverStartPermissions)) return SafeInteract.reply(interaction, this.config.messages.process.noPermissions);
                        if (server.scriptProcess) return SafeInteract.reply(interaction, this.config.messages.process.alreadyRunning);
                        return server.start(interaction);
                    case 'stop':
                        if ((interaction.memberPermissions && this.config.serverStopPermissions.lenght) && !interaction.memberPermissions.has(this.config.serverStopPermissions)) return SafeInteract.reply(interaction, this.config.messages.process.noPermissions);
                        if (!server.scriptProcess) return SafeInteract.reply(interaction, this.config.messages.process.notRunning);
                        return server.stop(interaction);
                }
            }
        );
    }
}