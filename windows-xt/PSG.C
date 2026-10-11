/* Standalone C89 Tandy PSG listening fixture. Open Watcom: -bt=dos -ms -0 */
#include <conio.h>
#include <dos.h>
#include <stdio.h>

static void tone(unsigned channel, unsigned divisor)
{
    outp(0xC0, 0x80 | (channel << 5) | (divisor & 15));
    outp(0xC0, (divisor >> 4) & 63);
    outp(0xC0, 0x90 | (channel << 5) | 3);
}

static void quiet(void)
{
    outp(0xC0, 0x9F);
    outp(0xC0, 0xBF);
    outp(0xC0, 0xDF);
    outp(0xC0, 0xFF);
}

int main(void)
{
    quiet();
    printf("Tandy PSG fixture: three notes, chord, noise, silence.\n");
    tone(0, 427);
    delay(250);
    quiet();
    tone(1, 339);
    delay(250);
    quiet();
    tone(2, 285);
    delay(250);
    tone(0, 427);
    tone(1, 339);
    delay(500);
    quiet();
    outp(0xC0, 0xE4);
    outp(0xC0, 0xF6);
    delay(250);
    quiet();
    printf("Fixture ended. Listen/record; this text is not an audio pass.\n");
    return 0;
}
