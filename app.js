// Updated startCamera function
async function startCamera() {
    const constraints = {
        video: {
            facingMode: {
                exact: 'environment'
            }
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        // Handle the stream (e.g., attach to video element)
    } catch (error) {
        console.error('Error accessing camera:', error);
        if (error.name === 'NotAllowedError') {
            console.error('Permission to access camera was denied.');
        } else if (error.name === 'NotFoundError') {
            console.error('No camera found.');
        } else if (error.name === 'NotSupportedError') {
            console.error('Camera not supported on this device.');
        } else {
            console.error('An unexpected error occurred:', error);
        }
    }
}