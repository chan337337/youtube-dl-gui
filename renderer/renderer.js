let platform;

(function () {
    init();
})();

async function init() {
    //Get platform
    platform = await window.main.invoke('platform');

    //Initialize titlebar
    if(platform === "darwin") {
        new windowbar({'style':'mac', 'dblClickable':false, 'fixed':true, 'title':document.title,'dark':true})
            .appendTo(document.body)
        $('.windowbar-title').css("left", "50%")
        $('.windowbar-controls').css("display","none")
    } else {
        new windowbar({'style':'win', 'dblClickable':false, 'fixed':true, 'title':document.title,'dark':true})
            .appendTo(document.body)
        $('.windowbar').prepend("<img src='../resources/assets/icon-titlebar-dark.png' alt='youtube-dl-gui icon' class='windowbar-icon'>")
        $('.windowbar-title').css("left", "45px")
    }
    $('.windowbar-minimize').on('click', () => {
        window.main.invoke('titlebarClick', "minimize")
    })
    $('.windowbar-close').on('click', () => {
        window.main.invoke('titlebarClick', "close")
    })
    $('.windowbar-maximize').on('click', () => {
        window.main.invoke('titlebarClick', "maximize")
    })

    //Configures the 4 error toasts
    $('#error, #warning, #connection, #update').toast({
        autohide: false,
        animation: true
    })

    $('#add-url-btn').on('click', () => {
        if($('#url-form')[0].checkValidity()) {
            window.main.invoke('videoAction', { action: "entry", url: $('#add-url').val() });
            $('#url-form').trigger('reset');
        }
    });

    $('#infoModal .dismiss').on('click', () => {
       $('#infoModal').modal("hide");
    });

    $('#infoModal .json').on('click', () => {
        window.main.invoke('videoAction', {action: "downloadInfo", identifier: $('#infoModal .identifier').html()})
    });

    let infoModal = new bootstrap.Modal(document.getElementById('infoModal'));

    //Enables the main process to show logs/errors in the renderer dev console
    window.main.receive("log", (arg) => console.log(arg));

    //Enables the main process to show toasts.
    window.main.receive("toast", (arg) => showToast(arg))

    //Updates the windowbar icon when the app gets maximized/unmaximized
    window.main.receive("maximized", (maximized) => {
        if(maximized) $('.windowbar').addClass("fullscreen");
        else $('.windowbar').removeClass("fullscreen");
    })

    window.main.receive("UIAction", (arg) => { //TODO decide whether to use locking feature
       switch(arg.action) {
           case "lock":
               for(const elem of arg.elements) {
                   $(elem).prop("disabled", arg.state);
               }
               break;
       }
    });

    window.main.receive("videoAction", (arg) => {
        switch(arg.action) {
            case "add":
                addVideo(arg);
                break;
            case "remove":
                $(getCard(arg.identifier)).remove();
                break;
            case "progress":
                updateProgress(arg);
                break;
            case "info":
                showInfoModal(arg.metadata, arg.identifier);
                break;
        }
    });

    //Opens the input menu (copy/paste) when an editable object gets right clicked.
    document.body.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        let node = e.target;
        while (node) {
            if (node.nodeName.match(/^(input|textarea)$/i) || node.isContentEditable) {
                window.main.invoke('openInputMenu');
                break;
            }
            node = node.parentNode;
        }
    });

}

function showToast(toastInfo) {
    if(toastInfo.type === "error" || toastInfo.type === "warning" || toastInfo.type === "update") {
        if(toastInfo.title != null) {
            $(`.${toastInfo.type}-title`).html(toastInfo.title);
        }
        $(`.${toastInfo.type}-body`).html(toastInfo.msg);
        $(`#${toastInfo.type}`).toast('show').css('visibility', 'visible');
    } else if(toastInfo.type === "connection") {
        $(`#${toastInfo.type}`).toast('show').css('visibility', 'visible');
    } else {
        console.error("Main tried to show a toast that doesn't exist.")
    }
}

//TODO add loader when thumbnail is loading OR wait for the thumbnail to be loaded before making the new video visible.
function addVideo(args) {
    let template = $('.template.video-card').clone();
    $(template).removeClass('template');
    $(template).prop('id', args.identifier);
    if(args.type === "single") {
        $(template).find('.card-title')
            .html(args.title)
            .prop('title', args.title);
        $(template).find('.progress-bar')
            .addClass('progress-bar-striped')
            .addClass('progress-bar-animated')
            .width("100%");
        $(template).find('img').prop("src", args.thumbnail);
        $(template).find('.info').addClass("d-none");
        $(template).find('.progress small').html("Initializing download")
        $(template).find('.metadata.left').html('<strong>Duration: </strong>' + ((args.duration == null) ? "Unknown" : args.duration));
        if(args.formats[args.selected_format_index].filesize_label != null) {
            $(template).find('.metadata.right').html('<strong>Size: </strong>' + args.formats[args.selected_format_index].filesize_label);
        } else {
            //TODO connect event listener so the load button actually works
            $(template).find('.metadata.right').html('<strong>Size: </strong><button class="btn btn-dark">Load</button>');
        }
        for(const format of args.formats) {
            let option = new Option(format.display_name, format.display_name);
            $(template).find('.custom-select.download-quality').append(option);
            $(option).addClass("video");
            if(args.formats.indexOf(format) === 0) $(template).find('.custom-select.download-quality').val(format.display_name).change();
        }
        $(template).find('.remove-btn').on('click', () => {
            $(getCard(args.identifier)).remove();
            window.main.invoke("videoAction", {action: "stop", identifier: args.identifier});
        });

        $(template).find('.custom-select.download-type').on('change', function () {
            let isAudio = this.selectedOptions[0].value === "audio";
            for(const elem of $(template).find('option')) {
                if($(elem).hasClass("video")) {
                    $(elem).toggle(!isAudio)
                } else if($(elem).hasClass("audio")) {
                    $(elem).toggle(isAudio)
                }
            }
            $(template).find('.custom-select.download-quality').val(isAudio ? "best" : args.formats[args.selected_format_index].display_name).change();
        });

        $(template).find('.download-btn').on('click', () => {
            let downloadArgs = {
                action: "download",
                url: args.url,
                identifier: args.identifier,
                format: $(template).find('.custom-select.download-quality').val(),
                type: $(template).find('.custom-select.download-type').val()
            }
            window.main.invoke("videoAction", downloadArgs)
            $(template).find('.progress').addClass("d-flex");
            $(template).find('.metadata.left').html('<strong>Speed: </strong>' + "0.00MiB/s");
            $(template).find('.metadata.right').html('<strong>ETA: </strong>' + "Unknown");
            $(template).find('.options').addClass("d-flex");
            $(template).find('select').addClass("d-none");
            $(template).find('.download-btn').addClass("disabled");
        });

        $(template).find('.info-btn').on('click', () => {
            window.main.invoke("videoAction", {action: "info", identifier: args.identifier});
        });

        $(template).find('.open .folder').on('click', () => {
            window.main.invoke("videoAction", {action: "open", identifier: args.identifier, type: "folder"});
        });
        $(template).find('.open .item').on('click', () => {
            window.main.invoke("videoAction", {action: "open", identifier: args.identifier, type: "item"});
        });


    } else if(args.type === "metadata") {
        $(template).find('.card-title')
            .html(args.url)
            .prop('title', args.url);
        $(template).find('.progress-bar')
            .addClass('progress-bar-striped')
            .addClass('progress-bar-animated')
            .width("100%")
            .prop("aria-valuenow", "indefinite");
        $(template).find('.progress').addClass("d-flex");
        $(template).find('.options').addClass("d-none");
        $(template).find('.metadata.info').html('Downloading metadata...');
        $(template).find('.buttons').children().each(function() { $(this).addClass("disabled"); });

    } else if(args.type === "playlist") {
        $(template).find('.card-title')
            .html(args.url)
            .prop('title', args.url);
        $(template).find('.progress small')
            .html('0.00% - 0 of ?')
        $(template).find('.progress').addClass("d-flex");
        $(template).find('.options').addClass("d-none");
        $(template).find('.metadata.info').html('Fetching video metadata...');
        $(template).find('.buttons').children().each(function() { $(this).addClass("disabled"); });
    }
    $('.video-cards').append(template);
}

function updateProgress(args) {
    let card = getCard(args.identifier);
    if(args.progress.reset != null && args.progress.reset) {
        resetProgress($(card).find('.progress-bar')[0], card);
        return;
    }
    if(args.progress.finished != null && args.progress.finished) {
        $(card).find('.progress small').html((args.progress.isAudio ? "Audio" : "Video") + " downloaded - 100%");
        $(card).find('.options').addClass("d-none");
        $(card).find('.options').removeClass("d-flex");
        $(card).find('.open').addClass("d-flex");
        return;
    }
    if(args.progress.done != null && args.progress.total != null) {
        $(card).find('.progress small').html(`${args.progress.percentage} - ${args.progress.done} of ${args.progress.total} `);
    } else {
        //TODO Prevent bar from going backwards
        console.log(args.progress.percentage.slice(0,-1))
        console.log(parseFloat(args.progress.percentage.slice(0, -1)) + " " + parseFloat($(card).find('.progress-bar').attr("aria-valuenow")))
        if(parseFloat(args.progress.percentage.slice(0, -1)) > parseFloat($(card).find('.progress-bar').attr("aria-valuenow"))) {
            $(card).find('.progress-bar').attr('aria-valuenow', args.progress.percentage.slice(0,-1)).css('width', args.progress.percentage);
            $(card).find('.progress small').html((args.progress.isAudio ? "Downloading audio" : "Downloading video") + " - " + args.progress.percentage);
            $(card).find('.metadata.right').html('<strong>ETA: </strong>' + args.progress.eta);
            $(card).find('.metadata.left').html('<strong>Speed: </strong>' + args.progress.speed);
        }
    }

}

function showInfoModal(info, identifier) {
    let modal = $('#infoModal');
    $(modal).find('img').prop("src", info.thumbnail);
    $(modal).find('.modal-title').html(info.title);
    $(modal).find('#info-description').html(info.description == null ? "No description was found." : info.description);
    $(modal).find('.uploader').html('<strong>Uploader: </strong>' + (info.uploader == null ? "Unknown" : info.uploader));
    $(modal).find('.extractor').html('<strong>Extractor: </strong>' + (info.extractor == null ? "Unknown" : info.extractor));
    $(modal).find('.url').html('<strong>URL: </strong>' + info.url);
    $(modal).find('[title="Views"]').html('<i class="bi bi-eye"></i> ' + (info.view_count == null ? "-" : info.view_count));
    $(modal).find('[title="Like / dislikes"]').html('<i class="bi bi-hand-thumbs-up"></i> ' + (info.like_count == null ? "-" : info.like_count) + ' &nbsp;&nbsp; <i class="bi bi-hand-thumbs-down"></i> ' + (info.dislike_count == null ? "-" : info.dislike_count));
    $(modal).find('[title="Average rating"]').html('<i class="bi bi-star"></i> ' + (info.average_rating == null ? "-" : info.average_rating.toString().slice(0,3)));
    $(modal).find('[title="Duration"]').html('<i class="bi bi-clock"></i> ' + (info.duration == null ? "-" : info.duration));
    $(modal).find('.identifier').html(identifier);
    $(modal).modal("show");
}

function resetProgress(elem, card) {
    $(elem).removeClass("progress-bar-striped").removeClass("progress-bar-animated");
    $(elem).remove();
    $(card).find('.progress').prepend('<div class="progress-bar" role="progressbar" style="width: 0%;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>')
}

function getCard(identifier) {
    let card;
    $('.video-cards').children().each(function() {
        if($(this).prop('id') === identifier) {
            card = this;
            return false;
        }
    })
    return card;
}